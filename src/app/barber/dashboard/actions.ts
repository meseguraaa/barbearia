"use server";

import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { revalidatePath } from "next/cache";
import { AppointmentStatus } from "@prisma/client";

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

async function getCurrentBarberId() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    throw new Error("UNAUTHENTICATED");
  }

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

  // 🔁 Aqui ajustamos: vínculo apenas pelo e-mail
  const barber = await prisma.barber.findUnique({
    where: { email: payload.email },
  });

  if (!barber) {
    throw new Error("BARBER_NOT_LINKED");
  }

  return barber.id;
}

async function updateAppointmentStatus(
  formData: FormData,
  newStatus: AppointmentStatus,
) {
  const appointmentId = String(formData.get("appointmentId") ?? "");

  if (!appointmentId) {
    return;
  }

  let barberId: string;
  try {
    barberId = await getCurrentBarberId();
  } catch (error) {
    console.error("[barber][updateAppointmentStatus] erro de sessão:", error);
    return;
  }

  // Garante que o barbeiro só altera agendamentos dele
  await prisma.appointment.updateMany({
    where: {
      id: appointmentId,
      barberId,
    },
    data: {
      status: newStatus,
    },
  });

  revalidatePath("/barber/dashboard");
}

export async function markAppointmentDone(formData: FormData) {
  return updateAppointmentStatus(formData, AppointmentStatus.DONE);
}

export async function cancelAppointment(formData: FormData) {
  return updateAppointmentStatus(formData, AppointmentStatus.CANCELED);
}
