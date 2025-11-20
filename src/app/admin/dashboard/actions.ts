"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import z from "zod";

/* ---------------------------------------------------------
 * Schema
 * ---------------------------------------------------------*/
const appointmentSchema = z.object({
  clientName: z.string(),
  phone: z.string(),
  description: z.string(),
  scheduleAt: z.date(),
  barberId: z.string().min(1, "O barbeiro é obrigatório"),
});

export type AppointmentData = z.infer<typeof appointmentSchema>;

/* ---------------------------------------------------------
 * Helper: hora + minuto em São Paulo (America/Sao_Paulo)
 * ---------------------------------------------------------*/
function getSaoPauloTime(date: Date): { hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");

  return { hour, minute };
}

/* ---------------------------------------------------------
 * REGRA 1: não permitir agendamento no passado
 * ---------------------------------------------------------*/
function validateNotInPast(scheduleAt: Date): string | null {
  const now = new Date();

  if (scheduleAt.getTime() < now.getTime()) {
    return "Não é possível agendar para um horário no passado";
  }

  return null;
}

/* ---------------------------------------------------------
 * REGRA 2: Pode agendar das 09:00 até 21:00 (contínuo)
 * ---------------------------------------------------------*/
function validateBusinessHours(scheduleAt: Date): string | null {
  const { hour, minute } = getSaoPauloTime(scheduleAt);
  const totalMinutes = hour * 60 + minute;

  const start = 9 * 60; // 09:00
  const end = 21 * 60; // 21:00

  if (totalMinutes < start || totalMinutes > end) {
    return `Agendamentos só podem ser feitos entre 9h-21h (horário de São Paulo)`;
  }

  return null;
}

/* ---------------------------------------------------------
 * Checar se já existe um agendamento para o MESMO barbeiro
 * no mesmo horário
 * ---------------------------------------------------------*/
async function ensureAvailability(
  scheduleAt: Date,
  barberId: string,
  excludeId?: string,
): Promise<string | null> {
  const existing = await prisma.appointment.findFirst({
    where: {
      scheduleAt,
      barberId,
      ...(excludeId && { id: { not: excludeId } }),
    },
  });

  if (existing) {
    return "Este barbeiro já possui um agendamento neste horário";
  }

  return null;
}

/* ---------------------------------------------------------
 * Helper TEMPORÁRIO: cliente padrão (sem login)
 * ---------------------------------------------------------*/
async function getDefaultClientId(): Promise<string> {
  const email = "anon@barbearia.local";

  const client = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Cliente não autenticado",
      role: "CLIENT",
    },
  });

  return client.id;
}

/* ---------------------------------------------------------
 * Wrapper para operações com try/catch + revalidate
 * ---------------------------------------------------------*/
async function withAppointmentMutation(
  operation: () => Promise<void>,
  defaultError: string,
) {
  try {
    await operation();
    // Atualiza home (site público)
    revalidatePath("/");
    // E também o painel admin, caso o form seja usado lá
    revalidatePath("/admin/dashboard");
  } catch (err) {
    console.log(err);
    return { error: defaultError };
  }
}

/* ---------------------------------------------------------
 * CREATE
 * ---------------------------------------------------------*/
export async function createAppointment(data: AppointmentData) {
  const parsed = appointmentSchema.parse(data);
  const { scheduleAt, barberId } = parsed;

  const pastError = validateNotInPast(scheduleAt);
  if (pastError) return { error: pastError };

  const scheduleError = validateBusinessHours(scheduleAt);
  if (scheduleError) return { error: scheduleError };

  const availabilityError = await ensureAvailability(scheduleAt, barberId);
  if (availabilityError) return { error: availabilityError };

  // Enquanto não temos login de cliente,
  // associamos a um "cliente padrão" seguro.
  const clientId = await getDefaultClientId();

  return withAppointmentMutation(async () => {
    await prisma.appointment.create({
      data: {
        ...parsed,
        clientId,
      },
    });
  }, "Falha ao criar o agendamento");
}

/* ---------------------------------------------------------
 * UPDATE
 * ---------------------------------------------------------*/
export async function updateAppointment(id: string, data: AppointmentData) {
  const parsed = appointmentSchema.parse(data);
  const { scheduleAt, barberId } = parsed;

  const pastError = validateNotInPast(scheduleAt);
  if (pastError) return { error: pastError };

  const scheduleError = validateBusinessHours(scheduleAt);
  if (scheduleError) return { error: scheduleError };

  const availabilityError = await ensureAvailability(scheduleAt, barberId, id);
  if (availabilityError) return { error: availabilityError };

  return withAppointmentMutation(async () => {
    await prisma.appointment.update({
      where: { id },
      // aqui não mudamos o clientId, só os campos do formulário
      data: parsed,
    });
  }, "Falha ao atualizar o agendamento");
}

/* ---------------------------------------------------------
 * DELETE
 * ---------------------------------------------------------*/
export async function deleteAppointment(id: string) {
  return withAppointmentMutation(async () => {
    await prisma.appointment.delete({ where: { id } });
  }, "Falha ao excluir o agendamento");
}
