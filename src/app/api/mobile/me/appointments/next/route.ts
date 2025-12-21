import { NextResponse } from "next/server";
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

function computeStatusLabel(status?: string | null) {
  const s = String(status ?? "").toUpperCase();
  if (s === "PENDING") return "CONFIRMADO";
  if (s === "DONE") return "CONCLUÍDO";
  if (s === "CANCELED") return "CANCELADO";
  return "CONFIRMADO";
}

function hoursDiff(dateFuture: Date, now: Date) {
  const ms = dateFuture.getTime() - now.getTime();
  return ms / (1000 * 60 * 60);
}

function computePolicy(params: {
  now: Date;
  scheduleAt: Date;
  appointmentStatus: string;
  cancelLimitHours?: number | null;
  cancelFeePercentage?: number | null;
}) {
  const {
    now,
    scheduleAt,
    appointmentStatus,
    cancelLimitHours,
    cancelFeePercentage,
  } = params;

  const statusUpper = String(appointmentStatus ?? "").toUpperCase();

  if (statusUpper !== "PENDING") {
    return {
      status: statusUpper,
      statusLabel: computeStatusLabel(statusUpper),
      canCancel: false,
      canReschedule: false,
      cancellationFeeEligible: false,
      cancellationFeeNotice: null as string | null,
      isInService: false,
    };
  }

  // ✅ Chegou o horário? Então é ATENDIMENTO no mobile
  const isInService = now.getTime() >= scheduleAt.getTime();

  if (isInService) {
    return {
      status: "IN_SERVICE",
      statusLabel: "ATENDIMENTO",
      canCancel: false,
      canReschedule: false,
      cancellationFeeEligible: false,
      cancellationFeeNotice: null as string | null,
      isInService: true,
    };
  }

  // Antes do horário: cancelar pode
  const canCancel = true;

  // Alterar: respeita janela cancelLimitHours (política do admin)
  const h = hoursDiff(scheduleAt, now);
  const hasLimit = typeof cancelLimitHours === "number" && cancelLimitHours > 0;
  const canReschedule = !hasLimit || h >= cancelLimitHours;

  // Taxa: se está dentro da janela e existe % de taxa
  const hasFee =
    typeof cancelFeePercentage === "number" && Number(cancelFeePercentage) > 0;
  const cancellationFeeEligible = hasLimit && hasFee && h < cancelLimitHours;

  const cancellationFeeNotice = cancellationFeeEligible
    ? "Este cancelamento pode ser cobrado em um próximo atendimento, conforme a política do estabelecimento."
    : null;

  return {
    status: "PENDING",
    statusLabel: computeStatusLabel("PENDING"),
    canCancel,
    canReschedule,
    cancellationFeeEligible,
    cancellationFeeNotice,
    isInService: false,
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
  try {
    const payload = await requireMobileAuth(req);

    if (payload.role && payload.role !== "CLIENT") {
      return NextResponse.json(
        { error: "Sem permissão" },
        { status: 403, headers: corsHeaders() },
      );
    }

    const now = new Date();

    // ✅ Janela para pegar atendimento em andamento (PENDING no passado recente)
    const LOOKBACK_HOURS = 24;
    const lookbackStart = new Date(
      now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000,
    );

    // ✅ "Próximo" no mobile = o PENDING mais próximo (inclui PENDING no passado até 24h)
    const next = await prisma.appointment.findFirst({
      where: {
        clientId: payload.sub,
        status: "PENDING",
        scheduleAt: { gte: lookbackStart },
      },
      orderBy: { scheduleAt: "asc" },
      select: {
        id: true,
        status: true,
        scheduleAt: true,
        description: true,
        unit: { select: { id: true, name: true } },
        barber: { select: { id: true, name: true } },
        service: {
          select: {
            id: true,
            name: true,
            durationMinutes: true,
            cancelLimitHours: true,
            cancelFeePercentage: true,
            price: true,
          },
        },
      },
    });

    if (!next) {
      return NextResponse.json(
        { ok: true, next: null },
        { status: 200, headers: corsHeaders() },
      );
    }

    const policy = computePolicy({
      now,
      scheduleAt: next.scheduleAt,
      appointmentStatus: String(next.status),
      cancelLimitHours: next.service?.cancelLimitHours ?? null,
      cancelFeePercentage: next.service?.cancelFeePercentage
        ? Number(next.service.cancelFeePercentage)
        : null,
    });

    return NextResponse.json(
      {
        ok: true,
        next: {
          id: next.id,
          serviceName: next.service?.name ?? next.description ?? "Serviço",
          unitName: next.unit?.name ?? "Unidade",
          barberName: next.barber?.name ?? "Profissional",
          startsAtLabel: formatPtBrDateTime(next.scheduleAt),

          status: policy.status,
          statusLabel: policy.statusLabel,

          canCancel: policy.canCancel,
          canReschedule: policy.canReschedule,
          cancellationFeeEligible: policy.cancellationFeeEligible,
          cancellationFeeNotice: policy.cancellationFeeNotice,

          unitId: next.unit?.id ?? null,
          serviceId: next.service?.id ?? null,
          barberId: next.barber?.id ?? null,
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

    console.error("[mobile/me/appointments/next] error:", err);
    return NextResponse.json(
      { error: "Erro ao buscar próximo agendamento" },
      { status: 500, headers: corsHeaders() },
    );
  }
}
