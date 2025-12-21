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
    "Access-Control-Allow-Methods": "POST,OPTIONS",
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
  return payload as unknown as MobileTokenPayload;
}

function computeCanReschedule(scheduleAt: Date) {
  const now = new Date();
  const diffMs = scheduleAt.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours >= 24;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const payload = await requireMobileAuth(req);
    if (payload.role && payload.role !== "CLIENT") {
      return NextResponse.json(
        { error: "Sem permissão" },
        { status: 403, headers: corsHeaders() },
      );
    }

    const id = String(params.id || "");
    if (!id) {
      return NextResponse.json(
        { error: "Id ausente" },
        { status: 400, headers: corsHeaders() },
      );
    }

    const body = await req.json().catch(() => ({}));
    const unitId = String(body?.unitId ?? "");
    const serviceId = body?.serviceId ? String(body.serviceId) : "";
    const barberId = body?.barberId ? String(body.barberId) : "";
    const scheduleAtRaw = String(body?.scheduleAt ?? "");
    const scheduleAt = scheduleAtRaw ? new Date(scheduleAtRaw) : null;

    if (!unitId || !serviceId || !barberId || !scheduleAt) {
      return NextResponse.json(
        { error: "Parâmetros incompletos" },
        { status: 400, headers: corsHeaders() },
      );
    }

    const current = await prisma.appointment.findFirst({
      where: { id, clientId: payload.sub, status: { not: "CANCELED" } },
      select: { id: true, scheduleAt: true },
    });

    if (!current) {
      return NextResponse.json(
        { error: "Agendamento não encontrado" },
        { status: 404, headers: corsHeaders() },
      );
    }

    const now = new Date();
    if (current.scheduleAt.getTime() <= now.getTime()) {
      return NextResponse.json(
        { error: "Agendamento já começou ou já passou." },
        { status: 400, headers: corsHeaders() },
      );
    }

    if (!computeCanReschedule(current.scheduleAt)) {
      return NextResponse.json(
        { error: "Não é possível alterar com menos de 24h de antecedência." },
        { status: 400, headers: corsHeaders() },
      );
    }

    const conflict = await prisma.appointment.findFirst({
      where: {
        id: { not: id },
        barberId,
        status: { not: "CANCELED" },
        scheduleAt,
      },
      select: { id: true },
    });

    if (conflict) {
      return NextResponse.json(
        { error: "Esse horário não está mais disponível." },
        { status: 409, headers: corsHeaders() },
      );
    }

    await prisma.appointment.update({
      where: { id },
      data: { unitId, serviceId, barberId, scheduleAt },
    });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: corsHeaders() },
    );
  } catch (err: any) {
    const msg = String(err?.message ?? "Erro");

    if (
      msg.toLowerCase().includes("token") ||
      msg.toLowerCase().includes("jwt") ||
      msg.toLowerCase().includes("signature")
    ) {
      return NextResponse.json(
        { error: "Não autorizado" },
        { status: 401, headers: corsHeaders() },
      );
    }

    console.error("[mobile/me/appointments/[id]/reschedule POST] error:", err);
    return NextResponse.json(
      { error: "Erro ao alterar agendamento" },
      { status: 500, headers: corsHeaders() },
    );
  }
}
