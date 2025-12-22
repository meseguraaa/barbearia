import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

type MobileTokenPayload = {
  sub: string;
  role?: "CLIENT" | "BARBER" | "ADMIN";
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function getJwtSecretKey() {
  const secret = process.env.APP_JWT_SECRET;
  if (!secret) throw new Error("APP_JWT_SECRET não definido no .env");
  return new TextEncoder().encode(secret);
}

async function requireMobileAuth(req: Request): Promise<MobileTokenPayload> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new Error("Token ausente");

  const { payload } = await jwtVerify(token, getJwtSecretKey());
  return payload as any;
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(req: Request) {
  try {
    const payload = await requireMobileAuth(req);
    const userId = payload.sub;

    // ✅ agora é findMany: pega TODAS as pendentes
    const appointments = await prisma.appointment.findMany({
      where: {
        clientId: userId,
        status: "DONE",
        reviewModalShown: false,
        review: { is: null },
      },
      orderBy: { scheduleAt: "desc" },
      include: { barber: true, service: true },
      take: 50, // limite seguro (ajuste se quiser)
    });

    const pendings = appointments.map((a) => ({
      appointmentId: a.id,
      scheduleAt: a.scheduleAt,
      barberName: a.barber?.name ?? "Profissional",
      serviceName: a.service?.name ?? "Atendimento",
    }));

    // tags continuam globais (admin cadastra)
    const tags = await prisma.reviewTag.findMany({
      where: { isActive: true },
      orderBy: { label: "asc" },
      select: { id: true, label: true },
    });

    return NextResponse.json(
      { ok: true, pendings, tags },
      { headers: corsHeaders() },
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Erro inesperado." },
      { status: 401, headers: corsHeaders() },
    );
  }
}
