import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

type MobileTokenPayload = {
  sub: string;
  role?: "CLIENT" | "BARBER" | "ADMIN";
};

const DEFAULT_RESCHEDULE_WINDOW_HOURS = 24;

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

function normalizeWindowHours(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;

  // proteção: limite superior razoável (30 dias)
  if (n > 24 * 30) return 24 * 30;
  return n;
}

function computeCanReschedule(scheduleAt: Date, windowHours: number) {
  const now = new Date();
  const diffMs = scheduleAt.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours >= windowHours;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const payload = await requireMobileAuth(req);

    if (payload.role && payload.role !== "CLIENT") {
      return NextResponse.json(
        { error: "Sem permissão" },
        { status: 403, headers: corsHeaders() },
      );
    }

    const { id } = await params;
    const apptId = String(id || "").trim();
    if (!apptId) {
      return NextResponse.json(
        { error: "Id ausente" },
        { status: 400, headers: corsHeaders() },
      );
    }

    const body = await req.json().catch(() => ({}));
    const unitId = String(body?.unitId ?? "").trim();
    const serviceId = body?.serviceId ? String(body.serviceId).trim() : "";
    const barberId = body?.barberId ? String(body.barberId).trim() : "";
    const scheduleAtRaw = String(body?.scheduleAt ?? "").trim();
    const scheduleAt = scheduleAtRaw ? new Date(scheduleAtRaw) : null;

    if (
      !unitId ||
      !serviceId ||
      !barberId ||
      !scheduleAt ||
      Number.isNaN(scheduleAt.getTime())
    ) {
      return NextResponse.json(
        { error: "Parâmetros incompletos" },
        { status: 400, headers: corsHeaders() },
      );
    }

    // 1) carrega o agendamento atual (pra validar janela)
    const current = await prisma.appointment.findFirst({
      where: { id: apptId, clientId: payload.sub, status: { not: "CANCELED" } },
      select: {
        id: true,
        scheduleAt: true,
        serviceId: true,
        service: {
          select: {
            id: true,
            cancelLimitHours: true,
          },
        },
      },
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

    // 2) janela configurável por serviço (baseada no serviço ATUAL do agendamento)
    const windowHours =
      normalizeWindowHours(current.service?.cancelLimitHours) ??
      DEFAULT_RESCHEDULE_WINDOW_HOURS;

    if (!computeCanReschedule(current.scheduleAt, windowHours)) {
      return NextResponse.json(
        {
          error: `Não é possível alterar com menos de ${windowHours}h de antecedência.`,
        },
        { status: 400, headers: corsHeaders() },
      );
    }

    // 3) pega o serviço novo pra atualizar descrição (admin geralmente usa appointment.description)
    const nextService = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, name: true },
    });

    if (!nextService) {
      return NextResponse.json(
        { error: "Serviço inválido" },
        { status: 400, headers: corsHeaders() },
      );
    }

    // 4) conflito de horário (mantém tua regra atual: mesmo scheduleAt)
    const conflict = await prisma.appointment.findFirst({
      where: {
        id: { not: apptId },
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

    // 5) update completo: troca ids + scheduleAt + description (✅ o que estava faltando)
    await prisma.appointment.update({
      where: { id: apptId },
      data: {
        unitId,
        serviceId,
        barberId,
        scheduleAt,

        // ✅ MUITO IMPORTANTE: reflete no admin/web (descrição do serviço)
        description: nextService.name,
      },
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
