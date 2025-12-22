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
    "Access-Control-Allow-Methods": "GET,OPTIONS",
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

          // ✅ extras pro app
          dateISO: mobileParts.dateISO,
          startTime: mobileParts.startTime,
        },
        units,
        rules: {
          canReschedule: rules.canReschedule,
          reason: rules.reason,
          diffHours: rules.diffHours,
          windowHours: rules.windowHours,
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

    console.error("[mobile/me/appointments/[id]/edit GET] error:", err);
    return NextResponse.json(
      { error: "Erro ao validar edição do agendamento" },
      { status: 500, headers: corsHeaders() },
    );
  }
}
