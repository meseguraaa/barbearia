"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import z from "zod";
import {
  getAvailabilityWindowsForBarberOnDate,
  getAvailableBarbersOnDate,
} from "@/utills/barber-availability";
import { getServerSession } from "next-auth";
import { nextAuthOptions } from "@/lib/nextauth";
import { Prisma } from "@prisma/client";

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
 * Helper: cliente padrão (sem login) – continua existindo
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
 * NOVO: descobrir clientId
 * 1) Tenta achar pelo telefone informado no agendamento
 * 2) Se não achar → tenta sessão NextAuth
 * 3) Se ainda não tiver → cai no cliente padrão
 * ---------------------------------------------------------*/
async function getClientIdForAppointment(phone: string): Promise<string> {
  // 1) tenta achar usuário pelo telefone
  if (phone) {
    const clientByPhone = await prisma.user.findFirst({
      where: { phone },
    });

    if (clientByPhone) {
      return clientByPhone.id;
    }
  }

  // 2) se não achar pelo telefone, tenta sessão
  try {
    const session = await getServerSession(nextAuthOptions);

    const userId = (session?.user as any)?.id as string | undefined;

    if (userId) {
      return userId;
    }
  } catch (error) {
    console.error(
      "Erro ao obter sessão do NextAuth em getClientIdForAppointment:",
      error,
    );
  }

  // 3) fallback seguro (admin / barbeiro criando agendamento manual)
  return getDefaultClientId();
}

/* ---------------------------------------------------------
 * Wrapper para operações com try/catch + revalidate
 * (agora repassa o retorno da operação)
 * ---------------------------------------------------------*/
async function withAppointmentMutation<T>(
  operation: () => Promise<T>,
  defaultError: string,
): Promise<T | { error: string }> {
  try {
    const result = await operation();

    // site público
    revalidatePath("/");
    // página do cliente
    revalidatePath("/client/schedule");
    // dashboard admin
    revalidatePath("/admin/dashboard");
    // dashboards barbeiro
    revalidatePath("/barber");
    revalidatePath("/barber/earnings");

    return result;
  } catch (err) {
    console.error(err);
    return { error: defaultError };
  }
}

/* ---------------------------------------------------------
 * CREATE (não consome crédito; apenas marca se é de plano)
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

  // 🔹 Descobre o clientId deste agendamento
  const clientId = await getClientIdForAppointment(parsed.phone);

  // Snapshots default (sem plano)
  let servicePriceAtTheTime = service.price; // Decimal
  let barberPercentageAtTheTime = service.barberPercentage; // Decimal
  let barberEarningValue = service.price
    .mul(service.barberPercentage)
    .div(new Prisma.Decimal(100)); // Decimal

  // Se usar plano, seta aqui
  let clientPlanId: string | null = null;

  // 🔹 Tenta usar um plano ativo do cliente
  if (clientId) {
    const clientPlan = await prisma.clientPlan.findFirst({
      where: {
        clientId,
        status: "ACTIVE",
        startDate: { lte: scheduleAt },
        endDate: { gte: scheduleAt },
      },
      include: {
        plan: true,
      },
    });

    if (clientPlan && clientPlan.plan.isActive) {
      const totalBookings = clientPlan.plan.totalBookings; // number

      // Se já consumiu todos os créditos, esse agendamento não deve usar plano
      if (clientPlan.usedBookings < totalBookings) {
        // Conta quantos agendamentos (não cancelados) já estão vinculados a ESTE ClientPlan
        const appointmentsUsingPlanCount = await prisma.appointment.count({
          where: {
            clientPlanId: clientPlan.id,
            status: { not: "CANCELED" },
          },
        });

        // Se já existe a quantidade máxima de agendamentos usando esse plano,
        // este novo agendamento fica como avulso (valor original do serviço).
        if (appointmentsUsingPlanCount < totalBookings) {
          // Verifica se o serviço faz parte do plano
          const planHasService = await prisma.planService.findFirst({
            where: {
              planId: clientPlan.planId,
              serviceId,
            },
          });

          if (planHasService) {
            clientPlanId = clientPlan.id;

            // ⚠️ commissionPercent é number → convertemos pra Decimal
            const commissionPercentDecimal = new Prisma.Decimal(
              clientPlan.plan.commissionPercent,
            );

            // RN4 — comissão vem do plano:
            // total da comissão = price * (commissionPercent / 100)
            // o barbeiro recebe esse total dividido pelos agendamentos do plano
            const totalCommissionValue = clientPlan.plan.price
              .mul(commissionPercentDecimal)
              .div(new Prisma.Decimal(100));

            const perBooking = totalCommissionValue.div(
              new Prisma.Decimal(totalBookings),
            );

            // snapshots base; o ajuste de cobrança (1º crédito x restantes)
            // será feito na conclusão (DONE)
            servicePriceAtTheTime = clientPlan.plan.price;
            barberPercentageAtTheTime = commissionPercentDecimal;
            barberEarningValue = perBooking;
          }
        }
      }
    }
  }

  // 🔹 Cria o agendamento (NÃO consome crédito aqui)
  return withAppointmentMutation(async () => {
    await prisma.appointment.create({
      data: {
        ...parsed, // inclui serviceId, description, etc.
        clientId,
        clientPlanId,
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
 * - Se o agendamento já é de plano, mantemos os snapshots
 *   (não recalculamos comissão / valor do plano)
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

  const appointmentUsesPlan = existing.clientPlanId !== null;

  let servicePriceAtTheTime = existing.servicePriceAtTheTime;
  let barberPercentageAtTheTime = existing.barberPercentageAtTheTime;
  let barberEarningValue = existing.barberEarningValue;

  // Se NÃO é de plano e o serviço foi alterado (ou não havia serviço antes),
  // recalculamos os snapshots a partir do serviço
  if (
    !appointmentUsesPlan &&
    (!existing.serviceId || existing.serviceId !== serviceId)
  ) {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
    });

    if (!service) {
      return { error: "Serviço não encontrado" };
    }

    servicePriceAtTheTime = service.price;
    barberPercentageAtTheTime = service.barberPercentage;
    barberEarningValue = service.price
      .mul(service.barberPercentage)
      .div(new Prisma.Decimal(100));
  }

  return withAppointmentMutation(async () => {
    await prisma.appointment.update({
      where: { id },
      // aqui não mudamos o clientId nem o clientPlanId,
      // só os campos do formulário e os snapshots calculados acima
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
 * Helper: garantir que exista um PEDIDO PENDENTE para este atendimento
 * - retorna a order encontrada ou criada
 * ---------------------------------------------------------*/
async function ensureOrderForAppointment(appointmentId: string) {
  // Se já tiver pedido, reaproveita
  const existingOrder = await prisma.order.findFirst({
    where: { appointmentId },
  });

  if (existingOrder) return existingOrder;

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { service: true },
  });

  if (!appt) return null;
  if (appt.status !== "DONE") return null;
  if (!appt.serviceId) return null;

  const priceDecimal =
    appt.servicePriceAtTheTime ?? appt.service?.price ?? new Prisma.Decimal(0);

  const newOrder = await prisma.order.create({
    data: {
      clientId: appt.clientId,
      appointmentId: appt.id,
      barberId: appt.barberId ?? null,
      // 🔹 Agora o pedido nasce como PENDENTE (checkout depois)
      status: "PENDING",
      totalAmount: priceDecimal,
      items: {
        create: [
          {
            serviceId: appt.serviceId,
            quantity: 1,
            unitPrice: priceDecimal,
            totalPrice: priceDecimal,
          },
        ],
      },
    },
  });

  return newOrder;
}

/* ---------------------------------------------------------
 * CONCLUDE (DONE) – consumindo crédito do plano
 * e EXPIRANDO quando usar o último crédito
 *
 * REGRA DO PLANO:
 * - Cliente paga o valor TOTAL do plano (ex: 360) só em UM crédito
 * - Demais créditos daquele ClientPlan não cobram nada (0)
 * - Barbeiro recebe comissão por crédito:
 *   (plan.price * commissionPercent / 100) / totalBookings
 *
 * Agora:
 * - Sempre que concluir, tenta garantir uma Order PENDING desse atendimento
 * - Retorna { orderId } (admin pode usar pra redirecionar pro checkout)
 * ---------------------------------------------------------*/
type ConcludeOptions = {
  concludedByRole?: RoleForAction;
};

export async function concludeAppointment(
  id: string,
  options?: ConcludeOptions,
) {
  return withAppointmentMutation(async () => {
    const appt = await prisma.appointment.findUnique({
      where: { id },
    });

    if (!appt) {
      throw new Error("Agendamento não encontrado");
    }

    // Se já estava DONE, só garante o concludedByRole e não mexe em créditos
    if (appt.status === "DONE") {
      await prisma.appointment.update({
        where: { id },
        data: {
          concludedByRole: options?.concludedByRole ?? appt.concludedByRole,
        },
      });

      const order = await ensureOrderForAppointment(id);
      return { orderId: order?.id ?? null };
    }

    // Se não está vinculado a nenhum plano, só marca DONE
    if (!appt.clientPlanId) {
      await prisma.appointment.update({
        where: { id },
        data: {
          status: "DONE",
          concludedByRole: options?.concludedByRole ?? null,
        },
      });

      const order = await ensureOrderForAppointment(id);
      return { orderId: order?.id ?? null };
    }

    // Busca o plano do cliente
    const clientPlan = await prisma.clientPlan.findUnique({
      where: { id: appt.clientPlanId },
      include: { plan: true },
    });

    // Se por algum motivo o plano não existir mais, só conclui o agendamento
    if (!clientPlan || !clientPlan.plan) {
      await prisma.appointment.update({
        where: { id },
        data: {
          status: "DONE",
          concludedByRole: options?.concludedByRole ?? null,
        },
      });

      const order = await ensureOrderForAppointment(id);
      return { orderId: order?.id ?? null };
    }

    // Se o plano não está ativo, só conclui sem mexer em crédito
    if (clientPlan.status !== "ACTIVE") {
      await prisma.appointment.update({
        where: { id },
        data: {
          status: "DONE",
          concludedByRole: options?.concludedByRole ?? null,
        },
      });

      const order = await ensureOrderForAppointment(id);
      return { orderId: order?.id ?? null };
    }

    const totalBookings = clientPlan.plan.totalBookings;
    const usedBookings = clientPlan.usedBookings;

    // Se já não há créditos, não vamos quebrar fluxo:
    // apenas marcamos DONE sem consumir nada.
    if (usedBookings >= totalBookings) {
      await prisma.appointment.update({
        where: { id },
        data: {
          status: "DONE",
          concludedByRole: options?.concludedByRole ?? null,
        },
      });

      const order = await ensureOrderForAppointment(id);
      return { orderId: order?.id ?? null };
    }

    // 🔢 Cálculo da comissão por crédito para o barbeiro
    const commissionPercentDecimal = new Prisma.Decimal(
      clientPlan.plan.commissionPercent,
    );

    const totalCommissionValue = clientPlan.plan.price
      .mul(commissionPercentDecimal)
      .div(new Prisma.Decimal(100));

    const perBooking = totalCommissionValue.div(
      new Prisma.Decimal(totalBookings),
    );

    // 💰 Regra de cobrança do cliente:
    // - Se ainda não havia créditos consumidos (usedBookings === 0 antes do incremento),
    //   este atendimento é o primeiro crédito → cobra o valor total do plano.
    // - Senão, este é 2º, 3º... crédito → não cobra nada do cliente.
    const isFirstCredit = usedBookings === 0;

    const newServicePriceAtTheTime = isFirstCredit
      ? clientPlan.plan.price
      : new Prisma.Decimal(0);

    const newBarberPercentageAtTheTime = commissionPercentDecimal;
    const newBarberEarningValue = perBooking;

    // 🔹 Descobre se este é o ÚLTIMO crédito
    const isLastCredit = usedBookings + 1 >= totalBookings;

    // 🔹 Fluxo ideal: plano ativo, com crédito → marca DONE e consome 1 crédito
    // Se for o último crédito, também EXPIRE o plano
    await prisma.$transaction([
      prisma.appointment.update({
        where: { id },
        data: {
          status: "DONE",
          concludedByRole: options?.concludedByRole ?? null,
          servicePriceAtTheTime: newServicePriceAtTheTime,
          barberPercentageAtTheTime: newBarberPercentageAtTheTime,
          barberEarningValue: newBarberEarningValue,
        },
      }),
      prisma.clientPlan.update({
        where: { id: clientPlan.id },
        data: isLastCredit
          ? {
              usedBookings: {
                increment: 1,
              },
              status: "EXPIRED",
            }
          : {
              usedBookings: {
                increment: 1,
              },
            },
      }),
    ]);

    const order = await ensureOrderForAppointment(id);
    return { orderId: order?.id ?? null };
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
    let cancelFeeValue: Prisma.Decimal | null = null;
    let cancelledByRole: RoleForAction | null = null;

    if (options?.applyFee && appt.service) {
      const feePercentage = appt.service.cancelFeePercentage;

      if (feePercentage && Number(feePercentage) > 0) {
        const basePrice = appt.servicePriceAtTheTime ?? appt.service.price; // Decimal

        const feeDecimal = basePrice
          .mul(feePercentage)
          .div(new Prisma.Decimal(100));

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

  // 🔹 Usa util que já calcula disponibilidade
  const baseBarbers = await getAvailableBarbersOnDate(date);

  if (!baseBarbers || baseBarbers.length === 0) {
    return [];
  }

  // 🔹 Busca no Prisma os serviços que cada barbeiro realiza
  const prismaBarbers = await prisma.barber.findMany({
    where: {
      id: {
        in: baseBarbers.map((b) => b.id),
      },
    },
    include: {
      services: {
        select: {
          serviceId: true,
        },
      },
    },
  });

  const servicesMap = new Map<string, string[]>(
    prismaBarbers.map((b) => [b.id, b.services.map((s) => s.serviceId)]),
  );

  // 🔹 devolve no formato esperado pelo AppointmentForm,
  //     com serviceIds para filtrar por serviço no front
  return baseBarbers.map((b) => ({
    id: b.id,
    name: b.name,
    email: b.email,
    phone: b.phone ?? "",
    isActive: b.isActive,
    role: "BARBER" as const,
    serviceIds: servicesMap.get(b.id) ?? [],
  }));
}
