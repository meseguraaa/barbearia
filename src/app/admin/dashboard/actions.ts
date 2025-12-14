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
import { addMinutes, subMinutes } from "date-fns";

import { cookies } from "next/headers";
import { jwtVerify } from "jose";

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
  // ✅ NOVO: no admin podemos mandar o clientId explícito
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

  // ✅ unitId vindo do form (cliente escolhe)
  // - No admin pode ser opcional (depende do fluxo)
  unitId: z.string().min(1).optional(),

  // espelho do nome do serviço (pra exibir)
  description: z.string().min(1, "Descrição é obrigatória"),
  scheduleAt: z.date(),
  serviceId: z.string().min(1, "O serviço é obrigatório"),
  barberId: z.string().min(1, "O barbeiro é obrigatório"),
});

export type AppointmentData = z.infer<typeof appointmentSchema>;

type RoleForAction = "ADMIN" | "BARBER";

const SESSION_COOKIE_NAME = "painel_session";

type PainelSessionPayload = {
  sub: string;
  role: "CLIENT" | "BARBER" | "ADMIN";
  email?: string;
  name?: string | null;
};

function getJwtSecretKey() {
  const secret = process.env.PAINEL_JWT_SECRET;
  if (!secret) {
    throw new Error("PAINEL_JWT_SECRET não definido no .env");
  }
  return new TextEncoder().encode(secret);
}

async function getRoleFromPainelSession(): Promise<{
  role?: RoleForAction;
  userId?: string;
  source: "PAINEL" | "NEXTAUTH" | "NONE";
}> {
  // 1) tenta cookie do painel
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    console.log("[auth] cookie painel_session exists?", !!token);

    if (token) {
      const { payload } = await jwtVerify(token, getJwtSecretKey());
      const data = payload as unknown as PainelSessionPayload;

      if (data?.role === "ADMIN" || data?.role === "BARBER") {
        return { role: data.role, userId: data.sub, source: "PAINEL" };
      }
    }
  } catch (err) {
    console.error("[auth] painel_session inválido:", err);
  }

  // 2) fallback: NextAuth
  try {
    const session = await getServerSession(nextAuthOptions);
    const sessionUserId = (session?.user as any)?.id as string | undefined;
    const sessionRoleRaw = (session?.user as any)?.role as string | undefined;

    if (sessionRoleRaw === "ADMIN" || sessionRoleRaw === "BARBER") {
      return {
        role: sessionRoleRaw as RoleForAction,
        userId: sessionUserId,
        source: "NEXTAUTH",
      };
    }

    if (sessionUserId) {
      const dbUser = await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { role: true, isActive: true },
      });

      if (
        dbUser?.isActive !== false &&
        (dbUser?.role === "ADMIN" || dbUser?.role === "BARBER")
      ) {
        return {
          role: dbUser.role as RoleForAction,
          userId: sessionUserId,
          source: "NEXTAUTH",
        };
      }
    }
  } catch (err) {
    console.error("[auth] erro NextAuth:", err);
  }

  return { source: "NONE" };
}

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
 * Garantir barbeiro vinculado à unidade
 * ---------------------------------------------------------*/
async function ensureBarberLinkedToUnit(
  barberId: string,
  unitId: string,
): Promise<string | null> {
  const link = await prisma.barberUnit.findFirst({
    where: {
      barberId,
      unitId,
      isActive: true,
    },
    select: { id: true },
  });

  if (!link) {
    return "Este profissional não está vinculado a esta unidade";
  }

  return null;
}

/* ---------------------------------------------------------
 * Garantir que o barbeiro executa o serviço
 * ---------------------------------------------------------*/
async function ensureBarberCanDoService(
  barberId: string,
  serviceId: string,
): Promise<string | null> {
  const link = await prisma.serviceProfessional.findFirst({
    where: {
      barberId,
      serviceId,
    },
    select: { id: true },
  });

  if (!link) {
    return "Este profissional não executa este serviço";
  }

  return null;
}

/* ---------------------------------------------------------
 * Conflito por intervalo (anti-teletransporte)
 * ---------------------------------------------------------*/
function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

/* ---------------------------------------------------------
 * Checar conflito de agenda por INTERVALO (ignorando CANCELADOS)
 * ---------------------------------------------------------*/
async function ensureAvailability(
  scheduleAt: Date,
  barberId: string,
  durationMinutes: number,
  excludeId?: string,
): Promise<string | null> {
  const newStart = scheduleAt;
  const newEnd = addMinutes(scheduleAt, Math.max(0, durationMinutes || 0));

  // Janela de busca para reduzir carga
  const windowStart = subMinutes(newStart, 12 * 60);
  const windowEnd = addMinutes(newEnd, 12 * 60);

  const candidates = await prisma.appointment.findMany({
    where: {
      barberId,
      status: { not: "CANCELED" },
      ...(excludeId && { id: { not: excludeId } }),
      scheduleAt: {
        gte: windowStart,
        lte: windowEnd,
      },
    },
    select: {
      id: true,
      scheduleAt: true,
      unitId: true,
      service: {
        select: {
          durationMinutes: true,
          name: true,
        },
      },
    },
    orderBy: {
      scheduleAt: "asc",
    },
  });

  for (const appt of candidates) {
    const existingStart = appt.scheduleAt;
    const existingDuration = appt.service?.durationMinutes ?? 0;
    const existingEnd = addMinutes(
      existingStart,
      Math.max(0, existingDuration),
    );

    if (intervalsOverlap(existingStart, existingEnd, newStart, newEnd)) {
      return "Este barbeiro já possui um agendamento que conflita com este horário (possível conflito entre unidades)";
    }
  }

  return null;
}

/* ---------------------------------------------------------
 * Helper: cliente padrão (sem login)
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
 * Descobrir clientId
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
  }

  const normalized = normalizePhone(phoneDigits);

  // 1) tenta achar USUÁRIO CLIENT pelo telefone normalizado
  if (normalized) {
    const clientByPhone = await prisma.user.findFirst({
      where: {
        phone: normalized,
        role: "CLIENT",
      },
      select: { id: true },
    });

    if (clientByPhone) {
      return clientByPhone.id;
    }
  }

  // 2) sessão (SÓ CLIENT)
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

  // 3) fallback
  return getDefaultClientId();
}

/* ---------------------------------------------------------
 * Wrapper para operações com try/catch + revalidate
 * ---------------------------------------------------------*/
async function withAppointmentMutation<T>(
  operation: () => Promise<T>,
  defaultError: string,
): Promise<T | { error: string }> {
  try {
    const result = await operation();

    revalidatePath("/");
    revalidatePath("/client/schedule");
    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/checkout");
    revalidatePath("/barber");
    revalidatePath("/barber/earnings");

    return result;
  } catch (err) {
    console.error(err);
    return { error: defaultError };
  }
}

/* ---------------------------------------------------------
 * ✅ Concluir atendimento (ADMIN/BARBER)
 * - Mantém compat com o client: concludeAppointment(id, { concludedByRole })
 * - Marca status como DONE
 * - Se existirem campos concludedAt/concludedByRole no schema, também preenche
 * ---------------------------------------------------------*/
const concludeAppointmentSchema = z.object({
  concludedByRole: z.enum(["ADMIN", "BARBER"]).optional(),
});

export async function concludeAppointment(
  appointmentId: string,
  data?: z.infer<typeof concludeAppointmentSchema>,
) {
  if (!appointmentId) return { error: "ID do agendamento é obrigatório" };

  const parsed = concludeAppointmentSchema.safeParse(data ?? {});
  if (!parsed.success) {
    return { error: "Payload inválido para concluir atendimento" };
  }

  // 🔥 agora a permissão vem do painel_session (e fallback no NextAuth)
  const auth = await getRoleFromPainelSession();

  console.log(
    "[concludeAppointment] auth:",
    auth.source,
    "role:",
    auth.role,
    "userId:",
    auth.userId,
  );

  if (auth.role !== "ADMIN" && auth.role !== "BARBER") {
    return { error: "Sem permissão para concluir este atendimento" };
  }

  const concludedByRole: RoleForAction =
    (parsed.data.concludedByRole as RoleForAction | undefined) ?? auth.role;

  console.log(
    "[concludeAppointment] allowed. concludedByRole:",
    concludedByRole,
    "appointmentId:",
    appointmentId,
  );

  const existing = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      status: true,
    } as any,
  });

  if (!existing) return { error: "Agendamento não encontrado" };
  if ((existing as any).status === "CANCELED") {
    return { error: "Não é possível concluir um agendamento cancelado" };
  }

  return withAppointmentMutation(async () => {
    // 1) Primeiro: concluir o atendimento (com fallback se campos não existirem)
    const baseData: Record<string, any> = { status: "DONE" };
    const tryData: Record<string, any> = {
      ...baseData,
      concludedAt: new Date(),
      concludedByRole,
    };

    let appt: {
      id: string;
      unitId: string;
      clientId: string | null;
      barberId: string | null;
      serviceId: string | null;
      servicePriceAtTheTime: Prisma.Decimal | null;
    };

    try {
      appt = await prisma.appointment.update({
        where: { id: appointmentId },
        data: tryData as any,
        select: {
          id: true,
          unitId: true,
          clientId: true,
          barberId: true,
          serviceId: true,
          servicePriceAtTheTime: true,
        },
      });
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      const looksLikeUnknownField =
        msg.includes("Unknown arg `concludedAt`") ||
        msg.includes("Unknown arg `concludedByRole`") ||
        msg.includes("concludedAt") ||
        msg.includes("concludedByRole");

      if (!looksLikeUnknownField) throw err;

      appt = await prisma.appointment.update({
        where: { id: appointmentId },
        data: baseData as any,
        select: {
          id: true,
          unitId: true,
          clientId: true,
          barberId: true,
          serviceId: true,
          servicePriceAtTheTime: true,
        },
      });
    }

    // 2) Depois: garantir Order/OrderItem pro checkout (transaction)
    await prisma.$transaction(async (tx) => {
      if (!appt.clientId) throw new Error("Appointment sem clientId");
      if (!appt.serviceId) throw new Error("Appointment sem serviceId");

      // cria/garante o pedido do atendimento
      // (assumindo que Order tem appointmentId; se for unique, melhor ainda)
      let order = await tx.order.findFirst({
        where: { appointmentId: appt.id },
        select: { id: true },
      });

      if (!order) {
        order = await tx.order.create({
          data: {
            status: "PENDING",
            unitId: appt.unitId,
            clientId: appt.clientId,
            barberId: appt.barberId,
            appointmentId: appt.id,
            totalAmount: new Prisma.Decimal(0),
          } as any,
          select: { id: true },
        });
      } else {
        // garante status pendente de checkout
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: "PENDING",
            unitId: appt.unitId,
            clientId: appt.clientId,
            barberId: appt.barberId,
          } as any,
        });
      }

      // garante item do serviço (1x)
      const unitPrice = appt.servicePriceAtTheTime ?? new Prisma.Decimal(0);

      const existingItem = await tx.orderItem.findFirst({
        where: {
          orderId: order.id,
          serviceId: appt.serviceId,
        },
        select: { id: true },
      });

      if (!existingItem) {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            serviceId: appt.serviceId,
            quantity: 1,
            unitPrice,
            totalPrice: unitPrice,
          } as any,
        });
      }

      // recalcula total do pedido
      const agg = await tx.orderItem.aggregate({
        where: { orderId: order.id },
        _sum: { totalPrice: true },
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          totalAmount: agg._sum.totalPrice ?? new Prisma.Decimal(0),
        } as any,
      });
    });

    return { ok: true };
  }, "Falha ao concluir o atendimento");
}

/* ---------------------------------------------------------
 * ✅ RESTAURADO: CANCELAR AGENDAMENTO (ADMIN/BARBER)
 * - Mantém compat com o client: cancelAppointment(id, { applyFee, cancelledByRole })
 * - Marca status como CANCELED
 * - Se existirem campos (canceledAt/cancelledByRole/cancelFeeValue), preenche também
 * - Se não existirem, faz fallback sem quebrar
 * ---------------------------------------------------------*/
const cancelAppointmentSchema = z.object({
  applyFee: z.boolean().optional(),
  cancelledByRole: z.enum(["ADMIN", "BARBER"]).optional(),
});

export async function cancelAppointment(
  appointmentId: string,
  data?: z.infer<typeof cancelAppointmentSchema>,
) {
  if (!appointmentId) return { error: "ID do agendamento é obrigatório" };

  const parsed = cancelAppointmentSchema.safeParse(data ?? {});
  if (!parsed.success) {
    return { error: "Payload inválido para cancelar agendamento" };
  }

  const auth = await getRoleFromPainelSession();

  console.log(
    "[cancelAppointment] auth:",
    auth.source,
    "role:",
    auth.role,
    "userId:",
    auth.userId,
  );

  if (auth.role !== "ADMIN" && auth.role !== "BARBER") {
    return { error: "Sem permissão para cancelar este agendamento" };
  }

  const cancelledByRole: RoleForAction =
    (parsed.data.cancelledByRole as RoleForAction | undefined) ?? auth.role;

  const applyFee = !!parsed.data.applyFee;

  const existing = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      status: true,
      servicePriceAtTheTime: true,
      // snapshots podem existir OU não no teu schema, então só vamos tentar usar se vier
      cancelFeePercentageAtTheTime: true,
      serviceId: true,
    } as any,
  });

  if (!existing) return { error: "Agendamento não encontrado" };
  if ((existing as any).status === "CANCELED") {
    return { error: "Agendamento já está cancelado" };
  }
  if ((existing as any).status === "DONE") {
    return { error: "Não é possível cancelar um agendamento concluído" };
  }

  // tenta descobrir % de taxa: usa snapshot se existir, senão busca no service
  let cancelFeePercentage: number | null = null;

  const snapPct = (existing as any).cancelFeePercentageAtTheTime;
  if (typeof snapPct === "number") cancelFeePercentage = snapPct;
  if (snapPct && typeof snapPct === "object" && "toNumber" in snapPct) {
    try {
      cancelFeePercentage = (snapPct as any).toNumber();
    } catch {}
  }

  if (cancelFeePercentage == null && (existing as any).serviceId) {
    const svc = await prisma.service.findUnique({
      where: { id: (existing as any).serviceId as string },
      select: { cancelFeePercentage: true },
    });

    if (svc && svc.cancelFeePercentage != null) {
      const pct = svc.cancelFeePercentage as any;
      if (typeof pct === "number") cancelFeePercentage = pct;
      else if (pct && typeof pct === "object" && "toNumber" in pct) {
        try {
          cancelFeePercentage = pct.toNumber();
        } catch {}
      }
    }
  }

  // calcula taxa (se aplicável)
  let cancelFeeValue: Prisma.Decimal | null = null;

  if (applyFee) {
    const price = (existing as any)
      .servicePriceAtTheTime as Prisma.Decimal | null;

    if (
      price &&
      cancelFeePercentage != null &&
      Number(cancelFeePercentage) > 0
    ) {
      cancelFeeValue = price
        .mul(new Prisma.Decimal(cancelFeePercentage))
        .div(new Prisma.Decimal(100));
    }
  }

  return withAppointmentMutation(async () => {
    const baseData: Record<string, any> = {
      status: "CANCELED",
    };

    // tenta preencher extras (se existirem no schema)
    const tryData: Record<string, any> = {
      ...baseData,
      canceledAt: new Date(),
      cancelledByRole,
      cancelFeeValue,
      // opcional: se teu schema tiver flag applyFee, você pode guardar também
      // cancelFeeApplied: applyFee,
    };

    try {
      await prisma.appointment.update({
        where: { id: appointmentId },
        data: tryData as any,
      });
      return { ok: true };
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      const looksLikeUnknownField =
        msg.includes("Unknown arg `canceledAt`") ||
        msg.includes("Unknown arg `cancelledByRole`") ||
        msg.includes("Unknown arg `cancelFeeValue`") ||
        msg.includes("canceledAt") ||
        msg.includes("cancelledByRole") ||
        msg.includes("cancelFeeValue");

      if (!looksLikeUnknownField) throw err;

      await prisma.appointment.update({
        where: { id: appointmentId },
        data: baseData as any,
      });
      return { ok: true };
    }
  }, "Falha ao cancelar o agendamento");
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

  // ✅ precisa de durationMinutes do serviço (e valida serviço ativo)
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: {
      id: true,
      price: true,
      barberPercentage: true,
      isActive: true,
      durationMinutes: true,
      unitId: true, // fallback legado
    },
  });

  if (!service) return { error: "Serviço não encontrado" };
  if (!service.isActive) return { error: "Serviço inativo" };

  // ✅ unidade do agendamento vem do form (cliente escolhe)
  // fallback: se admin/legado não mandar unitId, usa unitId do service
  const unitId = parsed.unitId ?? service.unitId;

  if (!unitId) {
    return { error: "Unidade é obrigatória para este agendamento" };
  }

  // ✅ REGRA: barbeiro precisa estar vinculado à unidade escolhida
  const linkError = await ensureBarberLinkedToUnit(barberId, unitId);
  if (linkError) return { error: linkError };

  // ✅ REGRA: barbeiro precisa executar o serviço
  const canDoError = await ensureBarberCanDoService(barberId, serviceId);
  if (canDoError) return { error: canDoError };

  // ✅ REGRA: conflito por intervalo (anti teletransporte)
  const availabilityError = await ensureAvailability(
    scheduleAt,
    barberId,
    service.durationMinutes,
  );
  if (availabilityError) return { error: availabilityError };

  const clientId = await getClientIdForAppointment(
    parsed.phone,
    parsed.clientId,
  );

  // Snapshots default (sem plano)
  let servicePriceAtTheTime = service.price;
  let barberPercentageAtTheTime = service.barberPercentage;
  let barberEarningValue = service.price
    .mul(service.barberPercentage)
    .div(new Prisma.Decimal(100));

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
      const totalBookings = clientPlan.plan.totalBookings;

      if (clientPlan.usedBookings < totalBookings) {
        const appointmentsUsingPlanCount = await prisma.appointment.count({
          where: {
            clientPlanId: clientPlan.id,
            status: { not: "CANCELED" },
          },
        });

        if (appointmentsUsingPlanCount < totalBookings) {
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

  return withAppointmentMutation(async () => {
    await prisma.appointment.create({
      data: {
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

        unitId,
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

  const existing = await prisma.appointment.findUnique({
    where: { id },
    select: {
      id: true,
      unitId: true,
      clientPlanId: true,
      serviceId: true,
      servicePriceAtTheTime: true,
      barberPercentageAtTheTime: true,
      barberEarningValue: true,
    },
  });

  if (!existing) return { error: "Agendamento não encontrado" };

  const appointmentUsesPlan = existing.clientPlanId !== null;

  let servicePriceAtTheTime = existing.servicePriceAtTheTime;
  let barberPercentageAtTheTime = existing.barberPercentageAtTheTime;
  let barberEarningValue = existing.barberEarningValue;

  const targetService = await prisma.service.findUnique({
    where: { id: serviceId },
    select: {
      id: true,
      price: true,
      barberPercentage: true,
      unitId: true,
      durationMinutes: true,
      isActive: true,
    },
  });

  if (!targetService) return { error: "Serviço não encontrado" };
  if (!targetService.isActive) return { error: "Serviço inativo" };

  if (
    !appointmentUsesPlan &&
    (!existing.serviceId || existing.serviceId !== serviceId)
  ) {
    servicePriceAtTheTime = targetService.price;
    barberPercentageAtTheTime = targetService.barberPercentage;
    barberEarningValue = targetService.price
      .mul(targetService.barberPercentage)
      .div(new Prisma.Decimal(100));
  }

  // ✅ unidade do agendamento vem do form
  // fallback: mantém a existente; ou do service
  const unitId = parsed.unitId ?? existing.unitId ?? targetService.unitId;

  if (!unitId) {
    return { error: "Unidade é obrigatória para este agendamento" };
  }

  const linkError = await ensureBarberLinkedToUnit(barberId, unitId);
  if (linkError) return { error: linkError };

  const canDoError = await ensureBarberCanDoService(barberId, serviceId);
  if (canDoError) return { error: canDoError };

  const availabilityError = await ensureAvailability(
    scheduleAt,
    barberId,
    targetService.durationMinutes,
    id,
  );
  if (availabilityError) return { error: availabilityError };

  return withAppointmentMutation(async () => {
    await prisma.appointment.update({
      where: { id },
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

        unitId,
      },
    });
  }, "Falha ao atualizar o agendamento");
}

/* ---------------------------------------------------------
 * DELETE
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
  unitId?: string,
) {
  const date = new Date(dateISO);

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      "Data inválida recebida em getAvailabilityWindowsForBarberOnDateAction",
    );
  }

  const windows = await getAvailabilityWindowsForBarberOnDate(barberId, date, {
    unitId,
  });

  return windows ?? null;
}

/* ---------------------------------------------------------
 * BARBEIROS DISPONÍVEIS PARA UMA DATA (compat)
 * ✅ reforça filtro por BarberUnit quando unitId vier
 * ---------------------------------------------------------*/
export async function getAvailableBarbersForDateAction(
  dateISO: string,
  unitId?: string,
) {
  const date = new Date(dateISO);

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      "Data inválida recebida em getAvailableBarbersForDateAction",
    );
  }

  const baseBarbers = await getAvailableBarbersOnDate(date, { unitId });

  if (!baseBarbers || baseBarbers.length === 0) {
    return [];
  }

  const prismaBarbers = await prisma.barber.findMany({
    where: {
      id: { in: baseBarbers.map((b) => b.id) },

      ...(unitId
        ? {
            units: {
              some: {
                unitId,
                isActive: true,
              },
            },
          }
        : {}),
    },
    include: {
      services: {
        select: { serviceId: true },
      },
    },
  });

  const allowedIds = new Set(prismaBarbers.map((b) => b.id));

  const servicesMap = new Map<string, string[]>(
    prismaBarbers.map((b) => [b.id, b.services.map((s) => s.serviceId)]),
  );

  return baseBarbers
    .filter((b) => allowedIds.has(b.id))
    .map((b) => ({
      id: b.id,
      name: b.name,
      email: b.email,
      phone: b.phone ?? "",
      isActive: b.isActive,
      role: "BARBER" as const,
      serviceIds: servicesMap.get(b.id) ?? [],
    }));
}

/* ---------------------------------------------------------
 * ✅ NOVO: BARBEIROS DISPONÍVEIS PARA UMA DATA + SERVIÇO + UNIDADE
 * Regra travada:
 *  - vinculado à unidade
 *  - faz o serviço
 *  - unidade aberta (via windows do util com unitId)
 * ---------------------------------------------------------*/
export async function getAvailableBarbersForDateAndServiceAction(
  dateISO: string,
  unitId: string,
  serviceId: string,
) {
  const date = new Date(dateISO);

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      "Data inválida recebida em getAvailableBarbersForDateAndServiceAction",
    );
  }

  if (!unitId) return [];
  if (!serviceId) return [];

  // 1) candidatos: ativo + vinculado à unidade + faz o serviço
  const candidates = await prisma.barber.findMany({
    where: {
      isActive: true,
      units: {
        some: {
          unitId,
          isActive: true,
        },
      },
      services: {
        some: {
          serviceId,
        },
      },
    },
    include: {
      services: { select: { serviceId: true } },
    },
    orderBy: { name: "asc" },
  });

  if (candidates.length === 0) return [];

  // 2) valida janela disponível no dia (com unitId)
  const available = [];
  for (const barber of candidates) {
    const windows = await getAvailabilityWindowsForBarberOnDate(
      barber.id,
      date,
      { unitId },
    );

    if (windows && windows.length > 0) {
      available.push(barber);
    }
  }

  // 3) normaliza pro formato do form
  return available.map((b) => ({
    id: b.id,
    name: b.name,
    email: b.email,
    phone: b.phone ?? "",
    isActive: b.isActive,
    role: "BARBER" as const,
    serviceIds: b.services.map((s) => s.serviceId),
  }));
}
