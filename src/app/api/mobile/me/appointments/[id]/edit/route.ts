import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAppJwt } from "@/lib/app-jwt";

type MobileTokenPayload = {
  sub: string;
  role?: "CLIENT" | "BARBER" | "ADMIN";
  companyId: string; // ✅ multi-tenant obrigatório
};

const DEFAULT_RESCHEDULE_WINDOW_HOURS = 24;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

async function requireMobileAuth(req: Request): Promise<MobileTokenPayload> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new Error("missing_token");

  const payload = (await verifyAppJwt(token)) as any;

  const companyId =
    typeof payload?.companyId === "string"
      ? String(payload.companyId).trim()
      : "";

  if (!companyId) throw new Error("missing_company_id");

  return { ...(payload as any), companyId } as MobileTokenPayload;
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
  // dateISO ao meio-dia local (evita bug de timezone no day picker do app)
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
    const companyId = payload.companyId;

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
            cancelLimitHours: true, // (usado como janela de reagendamento aqui)
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

    const isAuth =
      msg === "missing_token" ||
      msg === "missing_company_id" ||
      msg.includes("Invalid token payload") ||
      msg.toLowerCase().includes("jwt") ||
      msg.toLowerCase().includes("token") ||
      msg.toLowerCase().includes("signature");

    if (isAuth) {
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
