"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import z from "zod";
import {
  getAvailabilityWindowsForBarberOnDate,
  getAvailableBarbersOnDate,
} from "@/utills/barber-availability";

/* ---------------------------------------------------------
 * Schema
 * ---------------------------------------------------------*/
const appointmentSchema = z.object({
  clientName: z.string(),
  phone: z.string(),
  // espelho do nome do serviço (pra exibir)
  description: z.string(),
  scheduleAt: z.date(),
  serviceId: z.string().min(1, "O serviço é obrigatório"),
  barberId: z.string().min(1, "O barbeiro é obrigatório"),
});

export type AppointmentData = z.infer<typeof appointmentSchema>;

type RoleForAction = "ADMIN" | "BARBER";

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
 * no mesmo horário (ignorando CANCELADOS)
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
      status: {
        not: "CANCELED", // 👈 CANCELADO NÃO BLOQUEIA MAIS HORÁRIO
      },
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
    // site público
    revalidatePath("/");
    // dashboard admin
    revalidatePath("/admin/dashboard");
    // dashboards barbeiro
    revalidatePath("/barber");
    revalidatePath("/barber/earnings");
  } catch (err) {
    console.error(err);
    return { error: defaultError };
  }
}

/* ---------------------------------------------------------
 * CREATE
 * ---------------------------------------------------------*/
export async function createAppointment(data: AppointmentData) {
  const parsed = appointmentSchema.parse(data);
  const { scheduleAt, barberId, serviceId } = parsed;

  const pastError = validateNotInPast(scheduleAt);
  if (pastError) return { error: pastError };

  const scheduleError = validateBusinessHours(scheduleAt);
  if (scheduleError) return { error: scheduleError };

  const availabilityError = await ensureAvailability(scheduleAt, barberId);
  if (availabilityError) return { error: availabilityError };

  // Verifica se o serviço existe para poder calcular os ganhos
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
  });

  if (!service) {
    return { error: "Serviço não encontrado" };
  }

  // Enquanto não temos login de cliente,
  // associamos a um "cliente padrão" seguro.
  const clientId = await getDefaultClientId();

  // Snapshots de valores para não depender de futuras mudanças no Service
  const servicePriceAtTheTime = service.price; // Decimal
  const barberPercentageAtTheTime = service.barberPercentage; // Decimal
  const barberEarningValue = service.price
    .mul(service.barberPercentage)
    .div(100); // Decimal

  return withAppointmentMutation(async () => {
    await prisma.appointment.create({
      data: {
        ...parsed, // inclui serviceId, description, etc.
        clientId,
        servicePriceAtTheTime,
        barberPercentageAtTheTime,
        barberEarningValue,
        status: "PENDING",
      },
    });
  }, "Falha ao criar o agendamento");
}

/* ---------------------------------------------------------
 * UPDATE
 * ---------------------------------------------------------*/
export async function updateAppointment(id: string, data: AppointmentData) {
  const parsed = appointmentSchema.parse(data);
  const { scheduleAt, barberId, serviceId } = parsed;

  const pastError = validateNotInPast(scheduleAt);
  if (pastError) return { error: pastError };

  const scheduleError = validateBusinessHours(scheduleAt);
  if (scheduleError) return { error: scheduleError };

  const availabilityError = await ensureAvailability(scheduleAt, barberId, id);
  if (availabilityError) return { error: availabilityError };

  // Busca o agendamento atual para decidir se recalcula snapshot
  const existing = await prisma.appointment.findUnique({
    where: { id },
  });

  if (!existing) {
    return { error: "Agendamento não encontrado" };
  }

  let servicePriceAtTheTime = existing.servicePriceAtTheTime;
  let barberPercentageAtTheTime = existing.barberPercentageAtTheTime;
  let barberEarningValue = existing.barberEarningValue;

  // Se o serviço foi alterado (ou não havia serviço antes), recalculamos os snapshots
  if (!existing.serviceId || existing.serviceId !== serviceId) {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
    });

    if (!service) {
      return { error: "Serviço não encontrado" };
    }

    servicePriceAtTheTime = service.price;
    barberPercentageAtTheTime = service.barberPercentage;
    barberEarningValue = service.price.mul(service.barberPercentage).div(100);
  }

  return withAppointmentMutation(async () => {
    await prisma.appointment.update({
      where: { id },
      // aqui não mudamos o clientId, só os campos do formulário
      data: {
        ...parsed, // inclui serviceId, description, etc.
        servicePriceAtTheTime,
        barberPercentageAtTheTime,
        barberEarningValue,
      },
    });
  }, "Falha ao atualizar o agendamento");
}

/* ---------------------------------------------------------
 * CONCLUDE (DONE) – agora com log de quem concluiu
 * ---------------------------------------------------------*/
type ConcludeOptions = {
  concludedByRole?: RoleForAction;
};

export async function concludeAppointment(
  id: string,
  options?: ConcludeOptions,
) {
  return withAppointmentMutation(async () => {
    await prisma.appointment.update({
      where: { id },
      data: {
        status: "DONE",
        concludedByRole: options?.concludedByRole ?? null,
      },
    });
  }, "Falha ao concluir o agendamento");
}

/* ---------------------------------------------------------
 * CANCEL (CANCELED) COM OU SEM TAXA
 * ---------------------------------------------------------*/
type CancelOptions = {
  applyFee?: boolean;
  cancelledByRole?: RoleForAction;
};

export async function cancelAppointment(id: string, options?: CancelOptions) {
  return withAppointmentMutation(async () => {
    const appt = await prisma.appointment.findUnique({
      where: { id },
      include: { service: true },
    });

    if (!appt) {
      throw new Error("Agendamento não encontrado");
    }

    let cancelFeeApplied = false;
    let cancelFeeValue: any = null;
    let cancelledByRole: RoleForAction | null = null;

    if (options?.applyFee && appt.service) {
      const feePercentage = appt.service.cancelFeePercentage;

      if (feePercentage && Number(feePercentage) > 0) {
        const basePrice = appt.servicePriceAtTheTime ?? appt.service.price; // Decimal

        const feeDecimal = basePrice.mul(feePercentage).div(100);

        cancelFeeApplied = true;
        cancelFeeValue = feeDecimal;
        cancelledByRole = options.cancelledByRole ?? null;
      }
    } else if (!options?.applyFee) {
      // cancelamento sem taxa, mas ainda assim queremos saber quem cancelou
      cancelledByRole = options?.cancelledByRole ?? null;
    }

    await prisma.appointment.update({
      where: { id },
      data: {
        status: "CANCELED",
        cancelFeeApplied,
        cancelFeeValue,
        cancelledByRole,
      },
    });
  }, "Falha ao cancelar o agendamento");
}

/* ---------------------------------------------------------
 * DELETE – usado apenas na tela do USUÁRIO
 * (admin/barbeiro não têm botão para isso)
 * ---------------------------------------------------------*/
export async function deleteAppointment(id: string) {
  return withAppointmentMutation(async () => {
    await prisma.appointment.delete({
      where: { id },
    });
  }, "Falha ao excluir o agendamento");
}

/* ---------------------------------------------------------
 * DISPONIBILIDADE DO BARBEIRO
 * ---------------------------------------------------------*/
export async function getAvailabilityWindowsForBarberOnDateAction(
  barberId: string,
  dateISO: string,
) {
  const date = new Date(dateISO);
  const windows = await getAvailabilityWindowsForBarberOnDate(barberId, date);
  return windows ?? null; // null pra ficar mais amigável na serialização pro client
}

/* ---------------------------------------------------------
 * BARBEIROS DISPONÍVEIS PARA UMA DATA
 * ---------------------------------------------------------*/
export async function getAvailableBarbersForDateAction(dateISO: string) {
  const date = new Date(dateISO);

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      "Data inválida recebida em getAvailableBarbersForDateAction",
    );
  }

  const barbers = await getAvailableBarbersOnDate(date);

  return barbers.map((b) => ({
    id: b.id,
    name: b.name,
    email: b.email,
    phone: b.phone ?? "",
    isActive: b.isActive,
    role: "BARBER" as const,
  }));
}
