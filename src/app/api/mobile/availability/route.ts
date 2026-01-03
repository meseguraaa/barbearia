// app/api/mobile/availability/route.ts
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { getAvailableTimeSlotsForBarberOnDate } from "@/utills/barber-availability";

type MobileTokenPayload = {
  sub: string;
  role?: "CLIENT" | "BARBER" | "ADMIN";
  email?: string;
  name?: string | null;
  companyId: string; // ✅ multi-tenant obrigatório
};

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

  const companyId =
    typeof (payload as any)?.companyId === "string"
      ? String((payload as any).companyId).trim()
      : "";

  if (!companyId) throw new Error("companyId ausente no token");

  return { ...(payload as any), companyId } as MobileTokenPayload;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

function asInt(v: string | null) {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function hhmm(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Compara dia local (ano/mes/dia) entre duas datas.
 * dateISO no app vem como ISO ao meio-dia, então essa comparação é segura.
 */
function isSameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export async function GET(req: Request) {
  try {
    const payload = await requireMobileAuth(req);
    const companyId = payload.companyId;

    const { searchParams } = new URL(req.url);

    const barberId = String(searchParams.get("barberId") ?? "").trim();
    const unitId = String(searchParams.get("unitId") ?? "").trim();
    const dateISO = String(searchParams.get("dateISO") ?? "").trim();

    // ✅ Quando for edição, o app manda appointmentId
    const appointmentId = String(
      searchParams.get("appointmentId") ?? "",
    ).trim();

    // ✅ duração pode vir pelo serviceId (preferível) ou pelo número
    const serviceId = String(searchParams.get("serviceId") ?? "").trim();
    const serviceDurationInMinutesParam = asInt(
      searchParams.get("serviceDurationInMinutes"),
    );

    if (!barberId || !unitId || !dateISO) {
      return NextResponse.json(
        {
          ok: false,
          error: "Parâmetros obrigatórios: barberId, unitId e dateISO",
        },
        { status: 400, headers: corsHeaders() },
      );
    }

    const date = new Date(dateISO);
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json(
        { ok: false, error: "dateISO inválido" },
        { status: 400, headers: corsHeaders() },
      );
    }

    // ✅ valida se a unidade pertence ao tenant e existe
    const unit = await prisma.unit.findFirst({
      where: { id: unitId, companyId },
      select: { id: true, isActive: true },
    });

    if (!unit) {
      return NextResponse.json(
        { ok: false, error: "Unidade não encontrada" },
        { status: 404, headers: corsHeaders() },
      );
    }

    if (unit.isActive === false) {
      return NextResponse.json(
        { ok: false, error: "Unidade inativa" },
        { status: 400, headers: corsHeaders() },
      );
    }

    // ✅ valida se o barbeiro pertence ao tenant (evita cross-tenant via querystring)
    // ⚠️ Corrigido: barbeiro é Barber (não User)
    const barber = await prisma.barber.findFirst({
      where: { id: barberId, companyId, isActive: true },
      select: { id: true },
    });

    if (!barber) {
      return NextResponse.json(
        { ok: false, error: "Profissional não encontrado" },
        { status: 404, headers: corsHeaders() },
      );
    }

    let serviceDurationInMinutes = serviceDurationInMinutesParam;

    if (!serviceDurationInMinutes && serviceId) {
      // ✅ multi-tenant: service precisa ser do mesmo companyId
      const svc = await prisma.service.findFirst({
        where: { id: serviceId, companyId },
        select: { durationMinutes: true, isActive: true },
      });

      if (!svc) {
        return NextResponse.json(
          { ok: false, error: "Serviço não encontrado" },
          { status: 404, headers: corsHeaders() },
        );
      }

      if (svc.isActive === false) {
        return NextResponse.json(
          { ok: false, error: "Serviço inativo" },
          { status: 400, headers: corsHeaders() },
        );
      }

      serviceDurationInMinutes =
        Math.max(1, Number(svc?.durationMinutes ?? 0)) || 30;
    }

    if (!serviceDurationInMinutes) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Informe serviceId ou serviceDurationInMinutes para calcular os horários.",
        },
        { status: 400, headers: corsHeaders() },
      );
    }

    // ✅ valida vínculo do barbeiro na unidade (tenant-safe)
    const barberUnit = await prisma.barberUnit.findFirst({
      where: { barberId, unitId, isActive: true, companyId },
      select: { id: true },
    });

    if (!barberUnit) {
      return NextResponse.json(
        { ok: false, error: "Profissional não vinculado a esta unidade" },
        { status: 400, headers: corsHeaders() },
      );
    }

    // ✅ slots respeitando disponibilidade + conflitos + duração do serviço
    // ✅ em edição, exclui o próprio appointment dos conflitos
    // ✅ passa companyId pro motor (se já suportar), via any pra manter compat
    let slots = await getAvailableTimeSlotsForBarberOnDate(barberId, date, {
      companyId,
      unitId,
      serviceDurationInMinutes,
      slotIntervalInMinutes: 30,
      ...(appointmentId
        ? ({ excludeAppointmentId: appointmentId } as any)
        : {}),
    } as any);

    // ✅ Fallback de segurança em edição: injeta o horário atual do appointment se necessário
    if (appointmentId) {
      const appt = await prisma.appointment.findFirst({
        where: {
          id: appointmentId,
          companyId, // ✅ tenant scope
          clientId: payload.sub,
          status: { not: "CANCELED" },
        },
        select: {
          id: true,
          scheduleAt: true,
          unitId: true,
          barberId: true,
        },
      });

      if (
        appt &&
        appt.unitId === unitId &&
        String(appt.barberId ?? "") === barberId &&
        isSameLocalDay(appt.scheduleAt, date)
      ) {
        const t = hhmm(appt.scheduleAt);
        if (t && !slots.includes(t)) {
          slots = [t, ...slots];
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        slots,
        meta: {
          unitId,
          barberId,
          serviceId: serviceId || null,
          serviceDurationInMinutes,
          slotIntervalInMinutes: 30,
          appointmentId: appointmentId || null,
        },
      },
      { status: 200, headers: corsHeaders() },
    );
  } catch (err: any) {
    const msg = String(err?.message ?? "Não autorizado");

    if (
      msg.toLowerCase().includes("token") ||
      msg.toLowerCase().includes("jwt") ||
      msg.toLowerCase().includes("signature") ||
      msg.toLowerCase().includes("companyid")
    ) {
      return NextResponse.json(
        { ok: false, error: "Não autorizado" },
        { status: 401, headers: corsHeaders() },
      );
    }

    console.error("[api/mobile/availability] error:", err);
    return NextResponse.json(
      { ok: false, error: "Erro ao buscar disponibilidade" },
      { status: 500, headers: corsHeaders() },
    );
  }
}
