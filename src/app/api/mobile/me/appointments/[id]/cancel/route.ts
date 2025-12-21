import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

type MobileTokenPayload = {
  sub: string;
  role?: "CLIENT" | "BARBER" | "ADMIN";
};

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

function hoursDiff(dateFuture: Date, now: Date) {
  const ms = dateFuture.getTime() - now.getTime();
  return ms / (1000 * 60 * 60);
}

function computeFeeEligibility(params: {
  now: Date;
  scheduleAt: Date;
  cancelLimitHours?: number | null;
  cancelFeePercentage?: number | null;
}) {
  const { now, scheduleAt, cancelLimitHours, cancelFeePercentage } = params;

  const isInService = now.getTime() >= scheduleAt.getTime();
  if (isInService) return { eligible: false };

  const hasLimit = typeof cancelLimitHours === "number" && cancelLimitHours > 0;
  const hasFee =
    typeof cancelFeePercentage === "number" && Number(cancelFeePercentage) > 0;

  if (!hasLimit || !hasFee) return { eligible: false };

  const h = hoursDiff(scheduleAt, now);
  return { eligible: h < cancelLimitHours };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const payload = await requireMobileAuth(req);

    if (payload.role && payload.role !== "CLIENT") {
      return NextResponse.json(
        { error: "Sem permissão" },
        { status: 403, headers: corsHeaders() },
      );
    }

    const { id } = await ctx.params;

    const appointment = await prisma.appointment.findFirst({
      where: { id, clientId: payload.sub },
      select: {
        id: true,
        status: true,
        scheduleAt: true,
        unitId: true,
        barberId: true,
        servicePriceAtTheTime: true,
        service: {
          select: {
            price: true,
            cancelLimitHours: true,
            cancelFeePercentage: true,
          },
        },
      },
    });

    if (!appointment) {
      return NextResponse.json(
        { error: "Agendamento não encontrado" },
        { status: 404, headers: corsHeaders() },
      );
    }

    const statusUpper = String(appointment.status).toUpperCase();
    if (statusUpper === "DONE") {
      return NextResponse.json(
        { error: "Este agendamento já foi concluído" },
        { status: 400, headers: corsHeaders() },
      );
    }
    if (statusUpper === "CANCELED") {
      return NextResponse.json(
        { error: "Este agendamento já foi cancelado" },
        { status: 400, headers: corsHeaders() },
      );
    }

    const now = new Date();

    // chegou a hora = ATENDIMENTO no mobile, então bloqueia cancelamento
    if (now.getTime() >= appointment.scheduleAt.getTime()) {
      return NextResponse.json(
        { error: "Não é possível cancelar no horário do atendimento" },
        { status: 400, headers: corsHeaders() },
      );
    }

    const cancelFeePercentage = appointment.service?.cancelFeePercentage
      ? Number(appointment.service.cancelFeePercentage)
      : null;

    const fee = computeFeeEligibility({
      now,
      scheduleAt: appointment.scheduleAt,
      cancelLimitHours: appointment.service?.cancelLimitHours ?? null,
      cancelFeePercentage,
    });

    const basePrice =
      appointment.servicePriceAtTheTime ??
      (appointment.service?.price ? appointment.service.price : null);

    const feeValue =
      fee.eligible && basePrice && cancelFeePercentage
        ? Number(basePrice) * (Number(cancelFeePercentage) / 100)
        : 0;

    const shouldCreateFee =
      fee.eligible &&
      feeValue > 0 &&
      !!appointment.barberId &&
      !!appointment.unitId;

    await prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: appointment.id },
        data: {
          status: "CANCELED",
          cancelledByRole: "CLIENT",
          cancelFeeApplied: fee.eligible && feeValue > 0,
          cancelFeeValue: fee.eligible && feeValue > 0 ? feeValue : null,
        },
      });

      if (shouldCreateFee) {
        await tx.barberCancellationFee.upsert({
          where: { appointmentId: appointment.id },
          create: {
            appointmentId: appointment.id,
            barberId: appointment.barberId!,
            unitId: appointment.unitId,
            amount: feeValue,
          },
          update: { amount: feeValue },
        });
      }
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

    console.error("[mobile/me/appointments/:id/cancel] error:", err);
    return NextResponse.json(
      { error: "Erro ao cancelar agendamento" },
      { status: 500, headers: corsHeaders() },
    );
  }
}
