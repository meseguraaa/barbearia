import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

type MobileTokenPayload = {
  sub: string;
  role?: "CLIENT" | "BARBER" | "ADMIN";
  companyId: string; // ✅ multi-tenant obrigatório
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    // ✅ inclui x-company-id (mesmo se você não usar aqui, padroniza o app)
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-company-id",
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

  const sub = String((payload as any)?.sub || "").trim();
  if (!sub) throw new Error("Token inválido");

  const companyId =
    typeof (payload as any)?.companyId === "string"
      ? String((payload as any).companyId).trim()
      : "";
  if (!companyId) throw new Error("companyId ausente no token");

  return {
    sub,
    role: (payload as any).role,
    companyId,
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
  const headers = corsHeaders();

  try {
    const payload = await requireMobileAuth(req);
    const userId = payload.sub;
    const companyId = payload.companyId;

    // ✅ agora é findMany: pega TODAS as pendentes (✅ tenant-safe)
    const appointments = await prisma.appointment.findMany({
      where: {
        companyId,
        clientId: userId,
        status: "DONE",
        reviewModalShown: false,
        review: { is: null },
      },
      orderBy: { scheduleAt: "desc" },
      select: {
        id: true,
        scheduleAt: true,
        barber: { select: { name: true } },
        service: { select: { name: true } },
        description: true, // fallback
      },
      take: 50, // limite seguro (ajuste se quiser)
    });

    const pendings = appointments.map((a) => ({
      appointmentId: a.id,
      scheduleAt: a.scheduleAt,
      barberName: a.barber?.name ?? "Profissional",
      serviceName: a.service?.name ?? a.description ?? "Atendimento",
    }));

    // ✅ tags por tenant (admin cadastra por company)
    const tags = await prisma.reviewTag.findMany({
      where: { companyId, isActive: true },
      orderBy: { label: "asc" },
      select: { id: true, label: true },
    });

    const res = NextResponse.json({ ok: true, pendings, tags }, { headers });

    // ✅ debug leve: devolve tenant no header
    res.headers.set("x-company-id", companyId);

    return res;
  } catch (err: any) {
    const msg = String(err?.message ?? "Erro inesperado.");
    const lower = msg.toLowerCase();

    const isAuth =
      lower.includes("token") ||
      lower.includes("jwt") ||
      lower.includes("signature") ||
      lower.includes("companyid");

    return NextResponse.json(
      { ok: false, error: isAuth ? "Não autorizado" : msg },
      { status: isAuth ? 401 : 500, headers },
    );
  }
}
