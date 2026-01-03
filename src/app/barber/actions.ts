"use server";

import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { revalidatePath } from "next/cache";
import { AppointmentStatus, OrderStatus, Prisma, Role } from "@prisma/client";

const SESSION_COOKIE_NAME = "painel_session";

function getJwtSecretKey() {
  const secret = process.env.PAINEL_JWT_SECRET;
  if (!secret) {
    throw new Error("PAINEL_JWT_SECRET não definido no .env");
  }
  return new TextEncoder().encode(secret);
}

type PainelSessionPayload = {
  sub: string;
  role: "CLIENT" | "BARBER" | "ADMIN";
  email: string;
  name?: string | null;
};

async function getCurrentBarber() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) throw new Error("UNAUTHENTICATED");

  let payload: PainelSessionPayload | null = null;

  try {
    const { payload: raw } = await jwtVerify(token, getJwtSecretKey());
    payload = raw as PainelSessionPayload;
  } catch {
    throw new Error("UNAUTHENTICATED");
  }

  if (!payload || payload.role !== "BARBER") {
    throw new Error("FORBIDDEN");
  }

  // ✅ Multi-tenant: sempre precisamos do companyId do barbeiro para scoping
  const barber = await prisma.barber.findFirst({
    where: { email: payload.email },
    select: { id: true, email: true, companyId: true },
  });

  if (!barber) throw new Error("BARBER_NOT_LINKED");
  if (!barber.companyId) throw new Error("BARBER_WITHOUT_COMPANY");

  return barber;
}

/* ----------------------------------------------------------
   🧮 Recalcula snapshots quando status muda para DONE
   ✅ Multi-tenant: scoped por companyId
---------------------------------------------------------- */
async function ensureEarningsSnapshot(
  companyId: string,
  appointmentId: string,
) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, companyId },
    include: { service: true },
  });

  if (!appointment) return;

  const snapshotMissing =
    !appointment.servicePriceAtTheTime ||
    !appointment.barberPercentageAtTheTime ||
    !appointment.barberEarningValue;

  if (!snapshotMissing) return;

  const service = appointment.service;
  if (!service) return;

  const price = Number(appointment.servicePriceAtTheTime ?? service.price);
  const percent = Number(
    appointment.barberPercentageAtTheTime ?? service.barberPercentage ?? 0,
  );

  const earning = (price * percent) / 100;

  // ✅ Multi-tenant: updateMany com companyId no where (evita update cross-tenant)
  const updated = await prisma.appointment.updateMany({
    where: { id: appointmentId, companyId },
    data: {
      servicePriceAtTheTime: new Prisma.Decimal(price),
      barberPercentageAtTheTime: new Prisma.Decimal(percent),
      barberEarningValue: new Prisma.Decimal(earning),
    },
  });

  if (updated.count === 0) {
    // se alguém tentar forçar id de outro tenant, não atualiza
    return;
  }
}

/* ----------------------------------------------------------
   🧾 Garante que o Order do atendimento apareça no Checkout
   O checkout lista serviços com: status=PENDING + item.serviceId != null
   ✅ Multi-tenant: scoped por companyId
---------------------------------------------------------- */
async function ensureOrderVisibleInCheckout(
  companyId: string,
  appointmentId: string,
  barberId: string,
  unitId: string,
) {
  // ✅ Multi-tenant: findFirst com companyId
  const order = await prisma.order.findFirst({
    where: { appointmentId, companyId },
    select: { id: true, status: true, unitId: true, barberId: true },
  });

  if (!order) return;

  // Coloca exatamente no status que o /admin/checkout está buscando
  if (order.status !== OrderStatus.PENDING) {
    // ✅ Multi-tenant: updateMany com companyId
    await prisma.order.updateMany({
      where: { id: order.id, companyId },
      data: {
        status: OrderStatus.PENDING,
        // reforços de coerência (evita “sumir por filtro de unidade/barbeiro”)
        unitId,
        barberId: order.barberId ?? barberId,
        // limpeza de sinais de reserva, se for o caso
        reservedUntil: null,
        expiredAt: null,
      },
    });
  }
}

/* ----------------------------------------------------------
   🔧 Atualiza status + snapshots + sincroniza Order p/ checkout
   ✅ Multi-tenant: scoped por companyId
---------------------------------------------------------- */
async function updateAppointmentStatus(
  formData: FormData,
  newStatus: AppointmentStatus,
) {
  const appointmentId = String(formData.get("appointmentId") ?? "");
  if (!appointmentId) return;

  const barber = await getCurrentBarber();
  const companyId = barber.companyId;

  // Pegamos unitId também porque o checkout filtra por unidade
  // ✅ Multi-tenant: scoped por companyId
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, companyId },
    select: { id: true, barberId: true, unitId: true, status: true },
  });

  if (!appt || appt.barberId !== barber.id) {
    throw new Error("APPOINTMENT_NOT_FOUND_OR_FORBIDDEN");
  }

  if (
    newStatus === AppointmentStatus.CANCELED &&
    appt.status === AppointmentStatus.DONE
  ) {
    throw new Error("CANNOT_CANCEL_DONE");
  }

  // ✅ Multi-tenant: updateMany com companyId
  const updated = await prisma.appointment.updateMany({
    where: { id: appointmentId, barberId: barber.id, companyId },
    data: {
      status: newStatus,
      concludedByRole:
        newStatus === AppointmentStatus.DONE ? Role.BARBER : undefined,
      cancelledByRole:
        newStatus === AppointmentStatus.CANCELED ? Role.BARBER : undefined,
    },
  });

  if (updated.count === 0) {
    throw new Error("APPOINTMENT_NOT_FOUND_OR_FORBIDDEN");
  }

  if (newStatus === AppointmentStatus.DONE) {
    await ensureEarningsSnapshot(companyId, appointmentId);
    await ensureOrderVisibleInCheckout(
      companyId,
      appointmentId,
      barber.id,
      appt.unitId,
    );
  }

  // ✅ revalida as rotas certas
  revalidatePath("/barber/dashboard");
  revalidatePath("/barber/calendar");
  revalidatePath("/barber/earnings");

  // ✅ checkout admin (sua rota é essa)
  revalidatePath("/admin/checkout");
}

export async function markAppointmentDone(formData: FormData) {
  return updateAppointmentStatus(formData, AppointmentStatus.DONE);
}

export async function cancelAppointment(formData: FormData) {
  return updateAppointmentStatus(formData, AppointmentStatus.CANCELED);
}
