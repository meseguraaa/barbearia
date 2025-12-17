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

  const barber = await prisma.barber.findUnique({
    where: { email: payload.email },
  });

  if (!barber) throw new Error("BARBER_NOT_LINKED");

  return barber;
}

/* ----------------------------------------------------------
   🧮 Recalcula snapshots quando status muda para DONE
---------------------------------------------------------- */
async function ensureEarningsSnapshot(appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
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

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      servicePriceAtTheTime: new Prisma.Decimal(price),
      barberPercentageAtTheTime: new Prisma.Decimal(percent),
      barberEarningValue: new Prisma.Decimal(earning),
    },
  });
}

/* ----------------------------------------------------------
   🧾 Garante que o Order do atendimento apareça no Checkout
   O checkout lista serviços com: status=PENDING + item.serviceId != null
---------------------------------------------------------- */
async function ensureOrderVisibleInCheckout(
  appointmentId: string,
  barberId: string,
  unitId: string,
) {
  // Order é 1:1 com appointment via Order.appointmentId (unique)
  const order = await prisma.order.findUnique({
    where: { appointmentId: appointmentId },
    select: { id: true, status: true, unitId: true, barberId: true },
  });

  if (!order) return;

  // Coloca exatamente no status que o /admin/checkout está buscando
  if (order.status !== OrderStatus.PENDING) {
    await prisma.order.update({
      where: { id: order.id },
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
---------------------------------------------------------- */
async function updateAppointmentStatus(
  formData: FormData,
  newStatus: AppointmentStatus,
) {
  const appointmentId = String(formData.get("appointmentId") ?? "");
  if (!appointmentId) return;

  const barber = await getCurrentBarber();

  // Pegamos unitId também porque o checkout filtra por unidade
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
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

  const updated = await prisma.appointment.updateMany({
    where: { id: appointmentId, barberId: barber.id },
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
    await ensureEarningsSnapshot(appointmentId);
    await ensureOrderVisibleInCheckout(appointmentId, barber.id, appt.unitId);
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
