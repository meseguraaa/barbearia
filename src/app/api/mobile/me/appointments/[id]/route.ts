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

function normalizeWindowHours(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  if (n > 24 * 30) return 24 * 30;
  return n;
}

function computeCanReschedule(scheduleAt: Date, windowHours: number) {
  const now = new Date();
  const diffMs = scheduleAt.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  const ok = diffHours >= windowHours;

  return {
    canReschedule: ok,
    reason: ok ? null : `Menos de ${windowHours}h de antecedência.`,
    diffHours,
    windowHours,
  };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toMobileDateISOAndStartTime(scheduleAt: Date) {
  const dateISO = new Date(
    scheduleAt.getFullYear(),
    scheduleAt.getMonth(),
    scheduleAt.getDate(),
    12,
    0,
    0,
    0,
  ).toISOString();

  const startTime = `${pad2(scheduleAt.getHours())}:${pad2(
    scheduleAt.getMinutes(),
  )}`;

  return { dateISO, startTime };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/* =========================
   GET
========================= */
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
        service: {
          select: {
            id: true,
            name: true,
            durationMinutes: true,
            cancelLimitHours: true,
          },
        },
      },
    });

    if (!appt) {
      return NextResponse.json(
        { error: "Agendamento não encontrado" },
        { status: 404, headers: corsHeaders() },
      );
    }

    const windowHours =
      normalizeWindowHours(appt.service?.cancelLimitHours) ??
      DEFAULT_RESCHEDULE_WINDOW_HOURS;

    const rules = computeCanReschedule(appt.scheduleAt, windowHours);
    const mobileParts = toMobileDateISOAndStartTime(appt.scheduleAt);

    const units = await prisma.unit.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(
      {
        ok: true,
        appointment: {
          id: appt.id,
          unitId: appt.unitId,
          unitName: appt.unit?.name ?? null,
          serviceId: appt.serviceId ?? null,
          serviceName: appt.service?.name ?? null,
          barberId: appt.barberId ?? null,
          barberName: appt.barber?.name ?? null,
          scheduleAt: appt.scheduleAt.toISOString(),
          status: appt.status,
          dateISO: mobileParts.dateISO,
          startTime: mobileParts.startTime,
          canReschedule: rules.canReschedule,
        },
        units,
        rules,
      },
      { status: 200, headers: corsHeaders() },
    );
  } catch (err: any) {
    console.error("[mobile/me/appointments/[id] GET] error:", err);
    return NextResponse.json(
      { error: "Erro ao carregar agendamento" },
      { status: 500, headers: corsHeaders() },
    );
  }
}

/* =========================
   PATCH  ✅ NOVO
========================= */
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

    const body = await req.json();
    const { unitId, serviceId, barberId, scheduleAt } = body;

    if (!unitId || !serviceId || !barberId || !scheduleAt) {
      return NextResponse.json(
        { error: "Parâmetros incompletos" },
        { status: 400, headers: corsHeaders() },
      );
    }

    const appt = await prisma.appointment.findFirst({
      where: {
        id: apptId,
        clientId: payload.sub,
        status: { not: "CANCELED" },
      },
      include: { service: true },
    });

    if (!appt) {
      return NextResponse.json(
        { error: "Agendamento não encontrado" },
        { status: 404, headers: corsHeaders() },
      );
    }

    const windowHours =
      normalizeWindowHours(appt.service?.cancelLimitHours) ??
      DEFAULT_RESCHEDULE_WINDOW_HOURS;

    const rules = computeCanReschedule(new Date(appt.scheduleAt), windowHours);

    if (!rules.canReschedule) {
      return NextResponse.json(
        { error: rules.reason },
        { status: 409, headers: corsHeaders() },
      );
    }

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { name: true },
    });

    const updated = await prisma.appointment.update({
      where: { id: apptId },
      data: {
        unitId,
        serviceId,
        barberId,
        scheduleAt: new Date(scheduleAt),
        description: service?.name ?? appt.description,
      },
    });

    return NextResponse.json(
      { ok: true, appointment: updated },
      { status: 200, headers: corsHeaders() },
    );
  } catch (err: any) {
    console.error("[mobile/me/appointments/[id] PATCH] error:", err);
    return NextResponse.json(
      { error: "Erro ao alterar agendamento" },
      { status: 500, headers: corsHeaders() },
    );
  }
}
