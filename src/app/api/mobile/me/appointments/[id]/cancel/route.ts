import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAppJwt } from "@/lib/app-jwt";
import { Prisma } from "@prisma/client";

type MobileTokenPayload = {
  sub: string;
  role?: "CLIENT" | "BARBER" | "ADMIN";
  companyId: string; // ✅ multi-tenant obrigatório
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
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

// ✅ tenta gravar companyId se o schema suportar; fallback compat se não suportar.
function isUnknownArgError(err: any) {
  const msg = String(err?.message || "");
  return (
    msg.includes("Unknown arg") ||
    msg.includes("Unknown argument") ||
    (msg.includes("Argument") && msg.includes("is missing")) // Prisma varia mensagens
  );
}

function toNumberPrice(v: any): number | null {
  if (v === null || v === undefined) return null;

  // Prisma.Decimal
  if (typeof v === "object" && typeof v.toNumber === "function") {
    try {
      const n = v.toNumber();
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }

  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
    const companyId = payload.companyId;

    if (payload.role && payload.role !== "CLIENT") {
      return NextResponse.json(
        { error: "Sem permissão" },
        { status: 403, headers: corsHeaders() },
      );
    }

    const { id } = await ctx.params;
    const appointmentId = String(id ?? "").trim();

    if (!appointmentId) {
      return NextResponse.json(
        { error: "Id ausente" },
        { status: 400, headers: corsHeaders() },
      );
    }

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        companyId, // ✅ tenant scope
        clientId: payload.sub,
      },
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

    const basePriceNumber = toNumberPrice(basePrice);

    const feeValue =
      fee.eligible && basePriceNumber && cancelFeePercentage
        ? basePriceNumber * (Number(cancelFeePercentage) / 100)
        : 0;

    const shouldCreateFee =
      fee.eligible &&
      feeValue > 0 &&
      !!appointment.barberId &&
      !!appointment.unitId;

    await prisma.$transaction(async (tx) => {
      // ✅ update tenant-safe
      const updated = await tx.appointment.updateMany({
        where: {
          id: appointment.id,
          companyId,
          clientId: payload.sub,
          status: { notIn: ["DONE", "CANCELED"] as any },
        },
        data: {
          status: "CANCELED",
          cancelledByRole: "CLIENT",
          cancelFeeApplied: fee.eligible && feeValue > 0,
          cancelFeeValue: fee.eligible && feeValue > 0 ? feeValue : null,
        },
      });

      if (!updated?.count) {
        // alguém já alterou status entre o findFirst e a transação
        throw new Error("appointment_not_updatable");
      }

      if (shouldCreateFee) {
        const createWithCompany = {
          companyId,
          appointmentId: appointment.id,
          barberId: appointment.barberId!,
          unitId: appointment.unitId!,
          amount: feeValue,
        };

        const updateWithCompany = { companyId, amount: feeValue };

        const createCompat = {
          appointmentId: appointment.id,
          barberId: appointment.barberId!,
          unitId: appointment.unitId!,
          amount: feeValue,
        };

        const updateCompat = { amount: feeValue };

        // ✅ tenta com companyId; se o schema não suportar, fallback sem companyId
        try {
          await tx.barberCancellationFee.upsert({
            where: { appointmentId: appointment.id },
            create: createWithCompany as any,
            update: updateWithCompany as any,
          });
        } catch (e: any) {
          if (!isUnknownArgError(e)) throw e;

          await tx.barberCancellationFee.upsert({
            where: { appointmentId: appointment.id },
            create: createCompat as any,
            update: updateCompat as any,
          });
        }
      }
    });

    return NextResponse.json(
      { ok: true },
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

    if (msg === "appointment_not_updatable") {
      return NextResponse.json(
        { error: "Agendamento não pode ser cancelado" },
        { status: 409, headers: corsHeaders() },
      );
    }

    console.error("[mobile/me/appointments/:id/cancel] error:", err);
    return NextResponse.json(
      { error: "Erro ao cancelar agendamento" },
      { status: 500, headers: corsHeaders() },
    );
  }
}
