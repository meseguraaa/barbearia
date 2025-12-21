import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

type MobileTokenPayload = {
  sub: string;
  role?: "CLIENT" | "BARBER" | "ADMIN";
  email?: string;
  name?: string | null;
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS,PATCH",
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

function formatPtBrDateTime(date: Date) {
  const d = new Date(date);
  const dateLabel = d.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeLabel = d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dateLabel} • ${timeLabel}`;
}

function toISOAtNoonSPFromScheduleAt(scheduleAt: Date) {
  const inSP = new Date(
    scheduleAt.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
  );
  const yyyy = inSP.getFullYear();
  const mm = String(inSP.getMonth() + 1).padStart(2, "0");
  const dd = String(inSP.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T12:00:00-03:00`;
}

function startTimeFromScheduleAt(scheduleAt: Date) {
  return scheduleAt.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
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

export async function GET(
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

    const appt = await prisma.appointment.findFirst({
      where: { id: apptId, clientId: payload.sub, status: { not: "CANCELED" } },
      select: {
        id: true,
        status: true,
        scheduleAt: true,
        unitId: true,
        barberId: true,
        serviceId: true,
        unit: { select: { id: true, name: true } },
        barber: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, durationMinutes: true } },
      },
    });

    if (!appt) {
      return NextResponse.json(
        { error: "Agendamento não encontrado" },
        { status: 404, headers: corsHeaders() },
      );
    }

    const canReschedule = computeCanReschedule(appt.scheduleAt);

    return NextResponse.json(
      {
        ok: true,
        appointment: {
          id: appt.id,
          status: appt.status,
          scheduleAtISO: appt.scheduleAt.toISOString(),
          startsAtLabel: formatPtBrDateTime(appt.scheduleAt),

          unitId: appt.unitId,
          unitName: appt.unit?.name ?? "",
          serviceId: appt.serviceId ?? null,
          serviceName: appt.service?.name ?? "",
          barberId: appt.barberId ?? null,
          barberName: appt.barber?.name ?? "",

          serviceDurationMinutes: appt.service?.durationMinutes ?? 30,

          dateISO: toISOAtNoonSPFromScheduleAt(appt.scheduleAt),
          startTime: startTimeFromScheduleAt(appt.scheduleAt),

          canReschedule,
        },
      },
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

    console.error("[mobile/me/appointments/[id] GET] error:", err);
    return NextResponse.json(
      { error: "Erro ao buscar agendamento" },
      { status: 500, headers: corsHeaders() },
    );
  }
}

export async function PATCH(
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

    const unitId = String(body?.unitId ?? "");
    const serviceId = body?.serviceId ? String(body.serviceId) : null;
    const barberId = body?.barberId ? String(body.barberId) : null;
    const scheduleAtRaw = String(body?.scheduleAt ?? "");
    const scheduleAt = scheduleAtRaw ? new Date(scheduleAtRaw) : null;

    if (!unitId || !serviceId || !barberId || !scheduleAt) {
      return NextResponse.json(
        { error: "Parâmetros incompletos para alterar o agendamento" },
        { status: 400, headers: corsHeaders() },
      );
    }

    const current = await prisma.appointment.findFirst({
      where: {
        id: apptId,
        clientId: payload.sub,
        status: { not: "CANCELED" },
      },
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
        {
          error: "Agendamento já começou ou já passou. Não é possível alterar.",
        },
        { status: 400, headers: corsHeaders() },
      );
    }

    const canReschedule = computeCanReschedule(current.scheduleAt);
    if (!canReschedule) {
      return NextResponse.json(
        { error: "Não é possível alterar com menos de 24h de antecedência." },
        { status: 400, headers: corsHeaders() },
      );
    }

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

    await prisma.appointment.update({
      where: { id: apptId },
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

    console.error("[mobile/me/appointments/[id] PATCH] error:", err);
    return NextResponse.json(
      { error: "Erro ao alterar agendamento" },
      { status: 500, headers: corsHeaders() },
    );
  }
}
