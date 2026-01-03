import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAppJwt } from "@/lib/app-jwt";

type MobileTokenPayload = {
  sub: string;
  role: "CLIENT" | "BARBER" | "ADMIN";
  companyId: string; // ✅ multi-tenant obrigatório
  profile_complete?: boolean;
};

const DEFAULT_RESCHEDULE_WINDOW_HOURS = 24;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS,PATCH",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

async function requireMobileAuth(req: Request): Promise<MobileTokenPayload> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new Error("missing_token");

  const payload = await verifyAppJwt(token);
  return payload as MobileTokenPayload;
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
    const companyId = payload.companyId;

    if (payload.role !== "CLIENT") {
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
      where: {
        id: apptId,
        companyId, // ✅ tenant scope
        clientId: payload.sub,
        status: { not: "CANCELED" },
      },
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
      where: { companyId, isActive: true }, // ✅ tenant scope
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

    const msg = String(err?.message || "");
    const isAuth =
      msg === "missing_token" ||
      msg.includes("Invalid token payload") ||
      msg.toLowerCase().includes("jwt") ||
      msg.toLowerCase().includes("token");

    return NextResponse.json(
      { error: isAuth ? "Não autenticado" : "Erro ao carregar agendamento" },
      { status: isAuth ? 401 : 500, headers: corsHeaders() },
    );
  }
}

/* =========================
   PATCH
========================= */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const payload = await requireMobileAuth(req);
    const companyId = payload.companyId;

    if (payload.role !== "CLIENT") {
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
    const unitId = String(body?.unitId ?? "").trim();
    const serviceId = String(body?.serviceId ?? "").trim();
    const barberId = String(body?.barberId ?? "").trim();
    const scheduleAtRaw = String(body?.scheduleAt ?? "").trim();

    if (!unitId || !serviceId || !barberId || !scheduleAtRaw) {
      return NextResponse.json(
        { error: "Parâmetros incompletos" },
        { status: 400, headers: corsHeaders() },
      );
    }

    const scheduleAt = new Date(scheduleAtRaw);
    if (Number.isNaN(scheduleAt.getTime())) {
      return NextResponse.json(
        { error: "scheduleAt inválido" },
        { status: 400, headers: corsHeaders() },
      );
    }

    // ✅ garante que o appointment é do tenant + do cliente
    const appt = await prisma.appointment.findFirst({
      where: {
        id: apptId,
        companyId,
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

    // ✅ valida unidade/serviço/profissional no tenant
    const [unit, service, barberUnit, sp] = await Promise.all([
      prisma.unit.findFirst({
        where: { id: unitId, companyId, isActive: true },
        select: { id: true },
      }),
      prisma.service.findFirst({
        where: { id: serviceId, companyId, isActive: true },
        select: { id: true, name: true },
      }),
      prisma.barberUnit.findFirst({
        where: { companyId, unitId, barberId, isActive: true },
        select: { id: true },
      }),
      prisma.serviceProfessional.findFirst({
        where: { companyId, serviceId, barberId },
        select: { id: true },
      }),
    ]);

    if (!unit) {
      return NextResponse.json(
        { error: "Unidade não encontrada" },
        { status: 404, headers: corsHeaders() },
      );
    }

    if (!service) {
      return NextResponse.json(
        { error: "Serviço não encontrado" },
        { status: 404, headers: corsHeaders() },
      );
    }

    if (!barberUnit) {
      return NextResponse.json(
        { error: "Profissional não vinculado a esta unidade" },
        { status: 400, headers: corsHeaders() },
      );
    }

    if (!sp) {
      return NextResponse.json(
        { error: "Profissional não executa este serviço" },
        { status: 400, headers: corsHeaders() },
      );
    }

    // ✅ guard rail: update scoping por tenant + dono
    const updatedCount = await prisma.appointment.updateMany({
      where: {
        id: apptId,
        companyId,
        clientId: payload.sub,
      },
      data: {
        unitId,
        serviceId,
        barberId,
        scheduleAt,
        description: service.name ?? appt.description,
      },
    });

    if (updatedCount.count === 0) {
      return NextResponse.json(
        { error: "Agendamento não encontrado" },
        { status: 404, headers: corsHeaders() },
      );
    }

    const updated = await prisma.appointment.findFirst({
      where: {
        id: apptId,
        companyId,
        clientId: payload.sub,
      },
    });

    return NextResponse.json(
      { ok: true, appointment: updated },
      { status: 200, headers: corsHeaders() },
    );
  } catch (err: any) {
    console.error("[mobile/me/appointments/[id] PATCH] error:", err);

    const msg = String(err?.message || "");
    const isAuth =
      msg === "missing_token" ||
      msg.includes("Invalid token payload") ||
      msg.toLowerCase().includes("jwt") ||
      msg.toLowerCase().includes("token");

    return NextResponse.json(
      { error: isAuth ? "Não autenticado" : "Erro ao alterar agendamento" },
      { status: isAuth ? 401 : 500, headers: corsHeaders() },
    );
  }
}
