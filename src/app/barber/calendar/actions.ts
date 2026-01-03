// src/app/barber/calendar/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { AppointmentStatus } from "@prisma/client";
import { getCurrentPainelUser } from "@/lib/painel-session";

async function getCurrentBarberScopeOrThrow(): Promise<{
  barberId: string;
  companyId: string;
}> {
  const session = await getCurrentPainelUser();

  if (!session) throw new Error("UNAUTHENTICATED");
  if (session.role !== "BARBER") throw new Error("FORBIDDEN");
  if (!session.companyId) throw new Error("MISSING_COMPANY");

  const barber = await prisma.barber.findUnique({
    where: { userId: session.sub },
    select: { id: true },
  });

  if (!barber) throw new Error("BARBER_NOT_LINKED");

  return { barberId: barber.id, companyId: session.companyId };
}

async function updateAppointmentStatus(
  formData: FormData,
  newStatus: AppointmentStatus,
) {
  const appointmentId = String(formData.get("appointmentId") ?? "").trim();
  if (!appointmentId) return;

  let scope: { barberId: string; companyId: string };
  try {
    scope = await getCurrentBarberScopeOrThrow();
  } catch (error) {
    console.error("[barber][updateAppointmentStatus] erro de sessão:", error);
    return;
  }

  // ✅ Multi-tenant REAL + segurança:
  // - só altera agendamento do barbeiro logado
  // - e da company do token (tenant lock)
  await prisma.appointment.updateMany({
    where: {
      id: appointmentId,
      barberId: scope.barberId,
      companyId: scope.companyId,
    },
    data: {
      status: newStatus,
    },
  });

  revalidatePath("/barber/calendar");
}

export async function markAppointmentDone(formData: FormData) {
  return updateAppointmentStatus(formData, AppointmentStatus.DONE);
}

export async function cancelAppointment(formData: FormData) {
  return updateAppointmentStatus(formData, AppointmentStatus.CANCELED);
}
