"use server";

import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { revalidatePath } from "next/cache";
import { AppointmentStatus, Prisma } from "@prisma/client";

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
   🧮 Recalcula snapshots (valor do serviço, porcentagem 
      e ganho) quando o status muda para DONE.
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

  if (!snapshotMissing) return; // já existe, não recalcula

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
   🔧 Atualiza status E recalcula ganhos quando vira DONE
---------------------------------------------------------- */
async function updateAppointmentStatus(
  formData: FormData,
  newStatus: AppointmentStatus,
) {
  const appointmentId = String(formData.get("appointmentId") ?? "");
  if (!appointmentId) return;

  let barber;
  try {
    barber = await getCurrentBarber();
  } catch {
    return;
  }

  // garante que o barbeiro só mexe nos appointments dele
  await prisma.appointment.updateMany({
    where: { id: appointmentId, barberId: barber.id },
    data: { status: newStatus },
  });

  // SE STATUS = DONE → recalcula snapshots
  if (newStatus === "DONE") {
    await ensureEarningsSnapshot(appointmentId);
  }

  // revalida dashboard e ganhos
  revalidatePath("/barber/calendar");
  revalidatePath("/barber/earnings");
}

export async function markAppointmentDone(formData: FormData) {
  return updateAppointmentStatus(formData, AppointmentStatus.DONE);
}

export async function cancelAppointment(formData: FormData) {
  return updateAppointmentStatus(formData, AppointmentStatus.CANCELED);
}
