import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { getAvailableTimeSlotsForBarberOnDate } from "@/utills/barber-availability";

type MobileTokenPayload = {
  sub: string;
  role?: "CLIENT" | "BARBER" | "ADMIN";
  email?: string;
  name?: string | null;
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
  return payload as unknown as MobileTokenPayload;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
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

    const { searchParams } = new URL(req.url);

    const barberId = String(searchParams.get("barberId") ?? "");
    const unitId = String(searchParams.get("unitId") ?? "");
    const dateISO = String(searchParams.get("dateISO") ?? "");

    // ✅ Quando for edição, o app manda appointmentId
    const appointmentId = String(
      searchParams.get("appointmentId") ?? "",
    ).trim();

    // ✅ duração pode vir pelo serviceId (preferível) ou pelo número
    const serviceId = String(searchParams.get("serviceId") ?? "");
    const serviceDurationInMinutesParam = asInt(
      searchParams.get("serviceDurationInMinutes"),
    );

    if (!barberId || !unitId || !dateISO) {
      return Response.json(
        {
          ok: false,
          error: "Parâmetros obrigatórios: barberId, unitId e dateISO",
        },
        { status: 400, headers: corsHeaders() },
      );
    }

    const date = new Date(dateISO);
    if (Number.isNaN(date.getTime())) {
      return Response.json(
        { ok: false, error: "dateISO inválido" },
        { status: 400, headers: corsHeaders() },
      );
    }

    let serviceDurationInMinutes = serviceDurationInMinutesParam;

    if (!serviceDurationInMinutes && serviceId) {
      const svc = await prisma.service.findUnique({
        where: { id: serviceId },
        select: { durationMinutes: true },
      });

      serviceDurationInMinutes =
        Math.max(1, Number(svc?.durationMinutes ?? 0)) || 30;
    }

    if (!serviceDurationInMinutes) {
      return Response.json(
        {
          ok: false,
          error:
            "Informe serviceId ou serviceDurationInMinutes para calcular os horários.",
        },
        { status: 400, headers: corsHeaders() },
      );
    }

    // ✅ slots de 30 em 30 respeitando:
    // - soberania da unidade
    // - disponibilidade do barbeiro (na unidade)
    // - conflitos com agendamentos existentes
    // - duração do serviço
    //
    // ✅ NOVO (crucial): em edição, exclui o próprio appointment dos conflitos
    let slots = await getAvailableTimeSlotsForBarberOnDate(barberId, date, {
      unitId,
      serviceDurationInMinutes,
      slotIntervalInMinutes: 30,
      ...(appointmentId
        ? ({ excludeAppointmentId: appointmentId } as any)
        : {}),
    } as any);

    // ✅ Fallback de segurança:
    // Em edição, o horário atual "já é do cliente".
    // Se por qualquer motivo ele não vier, injeta de volta
    // (somente se for o mesmo dia + mesma unidade + mesmo barbeiro).
    if (appointmentId) {
      const appt = await prisma.appointment.findFirst({
        where: {
          id: appointmentId,
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

    return Response.json(
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
      msg.toLowerCase().includes("signature")
    ) {
      return Response.json(
        { ok: false, error: "Não autorizado" },
        { status: 401, headers: corsHeaders() },
      );
    }

    console.error("[api/mobile/availability] error:", err);
    return Response.json(
      { ok: false, error: "Erro ao buscar disponibilidade" },
      { status: 500, headers: corsHeaders() },
    );
  }
}
