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

export async function GET(req: Request) {
  try {
    await requireMobileAuth(req);

    const { searchParams } = new URL(req.url);

    const barberId = String(searchParams.get("barberId") ?? "");
    const unitId = String(searchParams.get("unitId") ?? "");
    const dateISO = String(searchParams.get("dateISO") ?? "");

    // ✅ Novo: duração pode vir pelo serviceId (preferível) ou pelo número
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

    // ✅ Aqui é o que você queria: slots de 30 em 30 respeitando:
    // - soberania da unidade
    // - disponibilidade do barbeiro (na unidade)
    // - conflitos com agendamentos existentes
    // - duração do serviço
    const slots = await getAvailableTimeSlotsForBarberOnDate(barberId, date, {
      unitId,
      serviceDurationInMinutes,
      slotIntervalInMinutes: 30,
    });

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
