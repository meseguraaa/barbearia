// app/admin/dashboard/actions.ts
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
 * Helpers
 * ---------------------------------------------------------*/
function normalizePhone(phone: string): string {
  return String(phone ?? "").replace(/\D/g, "");
}

function isValidPhoneDigits(phoneDigits: string): boolean {
  // BR normalmente 10 ou 11 dígitos (DDD + número)
  return phoneDigits.length === 10 || phoneDigits.length === 11;
}

/* ---------------------------------------------------------
 * Schema
 * ---------------------------------------------------------*/
const appointmentSchema = z.object({
  // ✅ NOVO: no admin podemos mandar o clientId explícito (mais seguro que telefone)
  clientId: z.string().min(1).optional(),

  clientName: z.string().min(1, "Nome do cliente é obrigatório"),
  phone: z
    .string()
    .min(1, "Telefone é obrigatório")
    .transform((v) => normalizePhone(v))
    .refine(
      (v) => isValidPhoneDigits(v),
      "Telefone inválido (use DDD + número)",
    ),

  // espelho do nome do serviço (pra exibir)
  description: z.string().min(1, "Descrição é obrigatória"),
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
 * 0) Se vier clientId explícito (ADMIN), usa ele (valida role CLIENT)
 * 1) Tenta achar CLIENTE pelo telefone informado no agendamento (NORMALIZADO)
 * 2) Se não achar → tenta sessão NextAuth (SÓ se for CLIENT)
 * 3) Se ainda não tiver → cai no cliente padrão
 * ---------------------------------------------------------*/
async function getClientIdForAppointment(
  phoneDigits: string,
  explicitClientId?: string,
): Promise<string> {
  // 0) admin mandou clientId? valida e usa
  if (explicitClientId) {
    const client = await prisma.user.findUnique({
      where: { id: explicitClientId },
      select: { id: true, role: true, isActive: true },
    });

    if (client && client.role === "CLIENT" && client.isActive !== false) {
      return client.id;
    }

    // se veio id inválido ou não CLIENT, não explode o sistema:
    // cai para os próximos passos
  }

  const normalized = normalizePhone(phoneDigits);

  // 1) tenta achar USUÁRIO CLIENT pelo telefone normalizado
  if (normalized) {
    const clientByPhone = await prisma.user.findFirst({
      where: {
        phone: normalized,
        role: "CLIENT", // ✅ CRÍTICO: impede pegar BARBER/ADMIN pelo mesmo telefone
      },
      select: { id: true },
    });

    if (clientByPhone) {
      return clientByPhone.id;
    }
  }

  // 2) se não achar pelo telefone, tenta sessão (SÓ CLIENT)
  try {
    const session = await getServerSession(nextAuthOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    const role = (session?.user as any)?.role as string | undefined;

    if (userId && role === "CLIENT") {
      return userId;
    }
  } catch (error) {
    console.error(
      "Erro ao obter sessão do NextAuth em getClientIdForAppointment:",
      error,
    );
  }

  // 3) fallback seguro
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
    // ✅ checkout (importante pra sumir / virar taxa)
    revalidatePath("/admin/checkout");
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
  // ✅ prioridade: parsed.clientId (ADMIN), senão telefone/sessão/fallback
  const clientId = await getClientIdForAppointment(
    parsed.phone,
    parsed.clientId,
  );

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

            const commissionPercentDecimal = new Prisma.Decimal(
              clientPlan.plan.commissionPercent,
            );

            const totalCommissionValue = clientPlan.plan.price
              .mul(commissionPercentDecimal)
              .div(new Prisma.Decimal(100));

            const perBooking = totalCommissionValue.div(
              new Prisma.Decimal(totalBookings),
            );

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
        // ⚠️ não espalha clientId do parsed pra dentro do create
        // porque o Prisma precisa do clientId calculado acima
        clientName: parsed.clientName,
        phone: parsed.phone,
        description: parsed.description,
        scheduleAt: parsed.scheduleAt,
        serviceId: parsed.serviceId,
        barberId: parsed.barberId,

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
        clientName: parsed.clientName,
        phone: parsed.phone,
        description: parsed.description,
        scheduleAt: parsed.scheduleAt,
        serviceId: parsed.serviceId,
        barberId: parsed.barberId,

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
    const isFirstCredit = usedBookings === 0;

    const newServicePriceAtTheTime = isFirstCredit
      ? clientPlan.plan.price
      : new Prisma.Decimal(0);

    const newBarberPercentageAtTheTime = commissionPercentDecimal;
    const newBarberEarningValue = perBooking;

    const isLastCredit = usedBookings + 1 >= totalBookings;

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
              usedBookings: { increment: 1 },
              status: "EXPIRED",
            }
          : {
              usedBookings: { increment: 1 },
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

    const cancelledByRole: RoleForAction | null =
      options?.cancelledByRole ?? null;

    let cancelFeeApplied = false;
    let cancelFeeValue: Prisma.Decimal | null = null;

    if (options?.applyFee && appt.service) {
      const feePercentage = appt.service.cancelFeePercentage;

      if (feePercentage && Number(feePercentage) > 0) {
        const basePrice = appt.servicePriceAtTheTime ?? appt.service.price;
        const feeDecimal = basePrice
          .mul(feePercentage)
          .div(new Prisma.Decimal(100));

        if (feeDecimal && feeDecimal.gt(new Prisma.Decimal(0))) {
          cancelFeeApplied = true;
          cancelFeeValue = feeDecimal;
        }
      }
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

    const existingOrder = await prisma.order.findFirst({
      where: { appointmentId: id },
      include: { items: true },
    });

    if (!cancelFeeApplied || !cancelFeeValue) {
      if (!existingOrder) return;

      if (
        existingOrder.status === "COMPLETED" ||
        existingOrder.status === "CANCELED"
      ) {
        return;
      }

      await prisma.order.update({
        where: { id: existingOrder.id },
        data: { status: "CANCELED" },
      });

      return;
    }

    if (!appt.serviceId) {
      return;
    }

    if (!existingOrder) {
      await prisma.order.create({
        data: {
          clientId: appt.clientId,
          appointmentId: appt.id,
          barberId: appt.barberId ?? null,
          status: "PENDING",
          totalAmount: cancelFeeValue,
          items: {
            create: [
              {
                serviceId: appt.serviceId,
                quantity: 1,
                unitPrice: cancelFeeValue,
                totalPrice: cancelFeeValue,
              },
            ],
          },
        },
      });

      return;
    }

    if (existingOrder.status === "COMPLETED") {
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: existingOrder.id },
        data: {
          status: "PENDING",
          totalAmount: cancelFeeValue,
          barberId: appt.barberId ?? null,
        },
      });

      await tx.orderItem.deleteMany({
        where: { orderId: existingOrder.id },
      });

      await tx.orderItem.create({
        data: {
          orderId: existingOrder.id,
          serviceId: appt.serviceId,
          quantity: 1,
          unitPrice: cancelFeeValue,
          totalPrice: cancelFeeValue,
        },
      });
    });
  }, "Falha ao cancelar o agendamento");
}

/* ---------------------------------------------------------
 * DELETE – usado apenas na tela do USUÁRIO
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
  return windows ?? null;
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

  const baseBarbers = await getAvailableBarbersOnDate(date);

  if (!baseBarbers || baseBarbers.length === 0) {
    return [];
  }

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
