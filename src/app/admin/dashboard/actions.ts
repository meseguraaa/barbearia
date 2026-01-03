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
import { addMinutes, subMinutes, addDays, startOfDay } from "date-fns";

import { cookies } from "next/headers";
import { jwtVerify } from "jose";

// ✅ NÍVEL DO CLIENTE (motor on-demand)
import { ensureCustomerLevelUpToDate } from "@/lib/customer-level-engine";

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

// ✅ cookie de contexto do painel (empresa selecionada)
const ADMIN_COMPANY_CONTEXT_COOKIE = "admin_company_context";

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
  email?: string;
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
        return {
          role: data.role,
          userId: data.sub,
          email: data.email,
          source: "PAINEL",
        };
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
    const sessionEmail = (session?.user as any)?.email as string | undefined;

    if (sessionRoleRaw === "ADMIN" || sessionRoleRaw === "BARBER") {
      return {
        role: sessionRoleRaw as RoleForAction,
        userId: sessionUserId,
        email: sessionEmail,
        source: "NEXTAUTH",
      };
    }

    if (sessionUserId) {
      const dbUser = await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { role: true, isActive: true, email: true },
      });

      if (
        dbUser?.isActive !== false &&
        (dbUser?.role === "ADMIN" || dbUser?.role === "BARBER")
      ) {
        return {
          role: dbUser.role as RoleForAction,
          userId: sessionUserId,
          email: dbUser.email,
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
 * ✅ Multi-tenant: resolver companyId do ator (ADMIN/BARBER)
 * ---------------------------------------------------------*/

// ✅ tenta ler contexto do painel (admin_company_context) e validar membership
async function getCompanyIdFromAdminContextCookie(args: {
  actorUserId: string;
}): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const companyId = String(
      cookieStore.get(ADMIN_COMPANY_CONTEXT_COOKIE)?.value ?? "",
    ).trim();

    if (!companyId) return null;

    const ok = await prisma.companyMember.findFirst({
      where: { userId: args.actorUserId, companyId, isActive: true } as any,
      select: { id: true },
    });

    return ok?.id ? companyId : null;
  } catch {
    return null;
  }
}

async function resolveCompanyIdForActorOrThrow(args: {
  actorRole?: RoleForAction;
  actorUserId?: string;
  actorEmail?: string;
}) {
  if (args.actorRole !== "ADMIN" && args.actorRole !== "BARBER") {
    throw new Error("Sem permissão (ator inválido)");
  }
  if (!args.actorUserId) {
    throw new Error("Sessão inválida (sem userId)");
  }

  // ✅ 1) BARBER: pega empresa pelo registro do barbeiro (mais confiável)
  if (args.actorRole === "BARBER") {
    const barber = await prisma.barber.findFirst({
      where: {
        OR: [
          ...(args.actorUserId ? [{ userId: args.actorUserId }] : []),
          ...(args.actorEmail ? [{ email: args.actorEmail }] : []),
        ],
        isActive: true,
      } as any,
      select: { companyId: true },
    });

    const barberCompanyId = String((barber as any)?.companyId ?? "").trim();
    if (barberCompanyId) return barberCompanyId;
    // se não achar (barber sem vínculo), cai pros fallbacks abaixo
  }

  // ✅ 2) ADMIN: tenta contexto do painel (cookie) e valida membership
  const ctxCompanyId = await getCompanyIdFromAdminContextCookie({
    actorUserId: args.actorUserId,
  });
  if (ctxCompanyId) return ctxCompanyId;

  // ✅ 3) fallback antigo: primeiro membership ativo
  const membership = await prisma.companyMember.findFirst({
    where: {
      userId: args.actorUserId,
      isActive: true,
    } as any,
    orderBy: { createdAt: "asc" },
    select: { companyId: true },
  });

  const companyId = String((membership as any)?.companyId ?? "").trim();
  if (!companyId) {
    throw new Error(
      "Admin/Barber sem companyId. Painel é multi-tenant: vincule o usuário a uma empresa.",
    );
  }

  return companyId;
}

async function ensureUnitBelongsToCompanyOrThrow(
  unitId: string,
  companyId: string,
) {
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, companyId } as any,
    select: { id: true, isActive: true },
  });

  if (!unit) throw new Error("Unidade não encontrada nesta empresa");
  if ((unit as any).isActive === false) throw new Error("Unidade inativa");

  return unit.id;
}

/* ---------------------------------------------------------
 * ✅ Guard: appointment pertence à company
 * (evita vazar por ID)
 * ---------------------------------------------------------*/
async function getAppointmentInCompanyOrThrow(args: {
  appointmentId: string;
  companyId: string;
  select?: any;
}) {
  const appt = await prisma.appointment.findFirst({
    where: { id: args.appointmentId, companyId: args.companyId } as any,
    select:
      args.select ??
      ({
        id: true,
        status: true,
        unitId: true,
        barberId: true,
        clientId: true,
        serviceId: true,
        scheduleAt: true,
        servicePriceAtTheTime: true,
      } as any),
  });

  if (!appt) throw new Error("Agendamento não encontrado");
  return appt as any;
}

/* ---------------------------------------------------------
 * ✅ NOVO: resolver Barber.id quando o ator logado é BARBER
 * (pra gravar auditoria em concludedByBarberId / cancelledByBarberId)
 * ---------------------------------------------------------*/
async function getBarberIdForActor(args: {
  actorRole?: RoleForAction;
  actorUserId?: string;
  actorEmail?: string;
  companyId?: string; // ✅ opcional pra evitar pegar barber de outra empresa
}): Promise<string | null> {
  if (args.actorRole !== "BARBER") return null;
  if (!args.actorUserId && !args.actorEmail) return null;

  const barber = await prisma.barber.findFirst({
    where: {
      ...(args.companyId ? { companyId: args.companyId } : {}),
      OR: [
        ...(args.actorUserId ? [{ userId: args.actorUserId }] : []),
        ...(args.actorEmail ? [{ email: args.actorEmail }] : []),
      ],
    } as any,
    select: { id: true },
  });

  return (barber as any)?.id ?? null;
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

function getSaoPauloDateKey(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // ex: 2025-12-15
  return formatter.format(date);
}

/**
 * ✅ Weekday no fuso de São Paulo (0..6, igual Date.getDay):
 * Evita bug quando o servidor está em UTC e o "dia" vira outro.
 */
function getSaoPauloWeekday(date: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  });

  const wd = formatter.format(date); // Sun, Mon, Tue...
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return map[wd] ?? date.getDay();
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map((n) => Number(n));
  return (h || 0) * 60 + (m || 0);
}

function sortIntervals<T extends { startTime: string; endTime: string }>(
  arr: T[],
) {
  return [...arr].sort((a, b) => a.startTime.localeCompare(b.startTime));
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
 * ✅ REGRA 2 (NOVA): validar horário REAL da UNIDADE (daily/weekly)
 * ---------------------------------------------------------*/
async function getUnitAvailabilityWindowsOnDate(args: {
  unitId: string;
  companyId: string;
  date: Date;
}): Promise<Array<{ startTime: string; endTime: string }>> {
  const { unitId, companyId, date } = args;

  const dayStart = startOfDay(date);
  const nextDay = addDays(dayStart, 1);

  const daily = await prisma.unitDailyAvailability.findFirst({
    where: {
      unitId,
      date: { gte: dayStart, lt: nextDay },
      unit: { companyId } as any,
    } as any,
    include: { intervals: true },
  });

  if (daily) {
    if ((daily as any).isClosed) return [];
    const intervals = (daily as any).intervals ?? [];
    if (intervals.length > 0) {
      const sorted = sortIntervals(intervals);
      return sorted.map((i) => ({
        startTime: i.startTime,
        endTime: i.endTime,
      }));
    }
    // daily existe mas sem intervalos e não fechada -> cai no weekly
  }

  const weekday = getSaoPauloWeekday(date);

  const weekly = await prisma.unitWeeklyAvailability.findFirst({
    where: {
      unitId,
      weekday,
      isActive: true,
      unit: { companyId } as any,
    } as any,
    include: { intervals: true },
  });

  if (
    !weekly ||
    !(weekly as any).intervals ||
    (weekly as any).intervals.length === 0
  ) {
    return [];
  }

  const sortedWeekly = sortIntervals((weekly as any).intervals);
  return sortedWeekly.map((i) => ({
    startTime: i.startTime,
    endTime: i.endTime,
  }));
}

async function validateWithinUnitHours(args: {
  unitId: string;
  companyId: string;
  scheduleAt: Date;
  durationMinutes: number;
}): Promise<string | null> {
  const { unitId, companyId, scheduleAt, durationMinutes } = args;

  const safeDuration = Math.max(0, durationMinutes || 0);
  const endAt = addMinutes(scheduleAt, safeDuration);

  const startKey = getSaoPauloDateKey(scheduleAt);
  const endKey = getSaoPauloDateKey(endAt);
  if (startKey !== endKey) {
    return "Este horário ultrapassa o dia e a unidade não permite agendamentos cruzando o fechamento";
  }

  const { hour: sh, minute: sm } = getSaoPauloTime(scheduleAt);
  const { hour: eh, minute: em } = getSaoPauloTime(endAt);

  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;

  const windows = await getUnitAvailabilityWindowsOnDate({
    unitId,
    companyId,
    date: scheduleAt,
  });

  if (!windows || windows.length === 0) {
    return "A unidade está fechada nesse dia";
  }

  const fits = windows.some((w) => {
    const ws = timeToMinutes(w.startTime);
    const we = timeToMinutes(w.endTime);
    return startMinutes >= ws && endMinutes <= we;
  });

  if (!fits) {
    return "A unidade está indisponível nesse horário (fora do horário ou em exceção/bloqueio)";
  }

  return null;
}

/* ---------------------------------------------------------
 * Garantir barbeiro vinculado à unidade (tenant-safe via unit.companyId)
 * ---------------------------------------------------------*/
async function ensureBarberLinkedToUnit(args: {
  barberId: string;
  unitId: string;
  companyId: string;
}): Promise<string | null> {
  const { barberId, unitId, companyId } = args;

  const link = await prisma.barberUnit.findFirst({
    where: {
      barberId,
      unitId,
      isActive: true,
      unit: { companyId } as any,
    } as any,
    select: { id: true },
  });

  if (!link) return "Este profissional não está vinculado a esta unidade";
  return null;
}

/* ---------------------------------------------------------
 * Garantir que o barbeiro executa o serviço (tenant-safe se Service tiver companyId)
 * ---------------------------------------------------------*/
async function ensureBarberCanDoService(args: {
  barberId: string;
  serviceId: string;
  companyId: string;
}): Promise<string | null> {
  const { barberId, serviceId, companyId } = args;

  const link = await prisma.serviceProfessional.findFirst({
    where: {
      barberId,
      serviceId,
      ...(companyId
        ? {
            service: { companyId } as any,
          }
        : {}),
    } as any,
    select: { id: true },
  });

  if (!link) return "Este profissional não executa este serviço";
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
 * ✅ tenant-safe (companyId)
 * ---------------------------------------------------------*/
async function ensureAvailability(args: {
  scheduleAt: Date;
  barberId: string;
  durationMinutes: number;
  companyId: string;
  excludeId?: string;
}): Promise<string | null> {
  const { scheduleAt, barberId, durationMinutes, companyId, excludeId } = args;

  const newStart = scheduleAt;
  const newEnd = addMinutes(scheduleAt, Math.max(0, durationMinutes || 0));

  const windowStart = subMinutes(newStart, 12 * 60);
  const windowEnd = addMinutes(newEnd, 12 * 60);

  const candidates = await prisma.appointment.findMany({
    where: {
      companyId,
      barberId,
      status: { not: "CANCELED" },
      ...(excludeId && { id: { not: excludeId } }),
      scheduleAt: { gte: windowStart, lte: windowEnd },
    } as any,
    select: {
      id: true,
      scheduleAt: true,
      unitId: true,
      service: { select: { durationMinutes: true, name: true } },
    },
    orderBy: { scheduleAt: "asc" },
  });

  for (const appt of candidates) {
    const existingStart = appt.scheduleAt;
    const existingDuration = (appt as any).service?.durationMinutes ?? 0;
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
 * Helper: garantir membership do CLIENT na company
 * ---------------------------------------------------------*/
async function ensureClientMembership(args: {
  userId: string;
  companyId: string;
}) {
  const { userId, companyId } = args;

  const existing = await prisma.companyMember.findFirst({
    where: { userId, companyId } as any,
    select: { id: true, isActive: true },
  });

  if (existing?.id) {
    if ((existing as any).isActive === false) {
      await prisma.companyMember.update({
        where: { id: existing.id } as any,
        data: { isActive: true } as any,
      });
    }
    return;
  }

  await prisma.companyMember.create({
    data: {
      userId,
      companyId,
      isActive: true,
      role: "CLIENT" as any,
    } as any,
  });
}

/* ---------------------------------------------------------
 * Helper: cliente padrão (sem login) por COMPANY
 * ---------------------------------------------------------*/
async function getDefaultClientId(companyId: string): Promise<string> {
  const email = `anon+${companyId}@barbearia.local`;

  const client = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Cliente não autenticado", role: "CLIENT" },
    select: { id: true },
  });

  await ensureClientMembership({ userId: client.id, companyId });

  return client.id;
}

/* ---------------------------------------------------------
 * Descobrir clientId (tenant-safe)
 * ---------------------------------------------------------*/
async function getClientIdForAppointment(args: {
  phoneDigits: string;
  companyId: string;
  explicitClientId?: string;
}): Promise<string> {
  const { phoneDigits, companyId, explicitClientId } = args;

  // 0) admin mandou clientId? valida (CLIENT + ativo + pertence à company)
  if (explicitClientId) {
    const client = await prisma.user.findFirst({
      where: {
        id: explicitClientId,
        role: "CLIENT",
        isActive: true,
        companyMemberships: {
          some: { companyId, isActive: true },
        },
      } as any,
      select: { id: true },
    });

    if (client?.id) return client.id;
  }

  const normalized = normalizePhone(phoneDigits);

  // 1) tenta achar CLIENT pelo telefone dentro da company
  if (normalized) {
    const clientByPhone = await prisma.user.findFirst({
      where: {
        phone: normalized,
        role: "CLIENT",
        companyMemberships: {
          some: { companyId, isActive: true },
        },
      } as any,
      select: { id: true },
    });

    if (clientByPhone?.id) return clientByPhone.id;
  }

  // 2) sessão (SÓ CLIENT) + precisa pertencer à company
  try {
    const session = await getServerSession(nextAuthOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    const role = (session?.user as any)?.role as string | undefined;

    if (userId && role === "CLIENT") {
      const ok = await prisma.companyMember.findFirst({
        where: { userId, companyId, isActive: true } as any,
        select: { id: true },
      });

      if (ok?.id) return userId;
    }
  } catch (error) {
    console.error(
      "Erro ao obter sessão do NextAuth em getClientIdForAppointment:",
      error,
    );
  }

  // 3) fallback por company
  return getDefaultClientId(companyId);
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
    revalidatePath("/admin/appointments");
    revalidatePath("/barber");
    revalidatePath("/barber/calendar");
    revalidatePath("/barber/earnings");

    return result;
  } catch (err) {
    console.error(err);
    return { error: defaultError };
  }
}

/* ---------------------------------------------------------
 * ✅ Concluir atendimento (ADMIN/BARBER)
 * ✅ tenant-safe: appointment.companyId
 * ✅ auditoria
 * ✅ NÍVEL DO CLIENTE: atualiza on-demand após concluir
 *
 * 🔥 FIX: transação única + OrderItem com companyId (compat)
 * - evita ficar DONE sem criar pedido
 * ---------------------------------------------------------*/
const concludeAppointmentSchema = z.object({
  concludedByRole: z.enum(["ADMIN", "BARBER"]).optional(),
});

// ✅ compat: OrderItem pode ou não ter companyId no schema
async function createOrderItemCompat(
  tx: any,
  data: Record<string, any>,
  companyId: string,
) {
  try {
    return await tx.orderItem.create({
      data: { ...data, companyId },
    });
  } catch {
    return await tx.orderItem.create({ data });
  }
}

export async function concludeAppointment(
  appointmentId: string,
  data?: z.infer<typeof concludeAppointmentSchema>,
) {
  if (!appointmentId) return { error: "ID do agendamento é obrigatório" };

  const parsed = concludeAppointmentSchema.safeParse(data ?? {});
  if (!parsed.success) {
    return { error: "Payload inválido para concluir atendimento" };
  }

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

  const companyId = await resolveCompanyIdForActorOrThrow({
    actorRole: auth.role,
    actorUserId: auth.userId,
    actorEmail: auth.email,
  });

  const concludedByRole: RoleForAction =
    (parsed.data.concludedByRole as RoleForAction | undefined) ?? auth.role;

  // ✅ auditoria: ator real (quem clicou)
  const actorUserId = auth.userId;
  const actorBarberId = await getBarberIdForActor({
    actorRole: auth.role,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    companyId, // ✅ evita barber de outra empresa
  });

  console.log(
    "[concludeAppointment] allowed. concludedByRole:",
    concludedByRole,
    "appointmentId:",
    appointmentId,
    "companyId:",
    companyId,
    "actorUserId:",
    actorUserId,
    "actorBarberId:",
    actorBarberId,
  );

  const existing = await getAppointmentInCompanyOrThrow({
    appointmentId,
    companyId,
    select: { id: true, status: true },
  });

  if (!existing) return { error: "Agendamento não encontrado" };
  if ((existing as any).status === "CANCELED") {
    return { error: "Não é possível concluir um agendamento cancelado" };
  }

  if ((existing as any).status === "DONE") {
    return { ok: true };
  }

  return withAppointmentMutation(async () => {
    // 🔥 tudo em UMA transação: se falhar pedido/item, não fica DONE
    const apptAfter = await prisma.$transaction(async (tx) => {
      const updateData: Record<string, any> = {
        status: "DONE",
        concludedByRole,

        ...(auth.role === "ADMIN" && actorUserId
          ? { concludedByUserId: actorUserId }
          : {}),
        ...(auth.role === "BARBER" && actorBarberId
          ? { concludedByBarberId: actorBarberId }
          : {}),
      };

      const upd = await tx.appointment.updateMany({
        where: { id: appointmentId, companyId } as any,
        data: updateData as any,
      });

      if ((upd as any).count !== 1) {
        throw new Error("Agendamento não encontrado");
      }

      const appt = await tx.appointment.findFirst({
        where: { id: appointmentId, companyId } as any,
        select: {
          id: true,
          companyId: true,
          unitId: true,
          clientId: true,
          barberId: true,
          serviceId: true,
          servicePriceAtTheTime: true,
        } as any,
      });

      if (!appt) throw new Error("Agendamento não encontrado");
      if (!(appt as any).clientId) throw new Error("Appointment sem clientId");
      if (!(appt as any).serviceId)
        throw new Error("Appointment sem serviceId");

      // cria/atualiza pedido no checkout
      let order = await tx.order.findFirst({
        where: { appointmentId: (appt as any).id, companyId } as any,
        select: { id: true },
      });

      if (!order) {
        order = await tx.order.create({
          data: {
            status: "PENDING",
            companyId,
            unitId: (appt as any).unitId,
            clientId: (appt as any).clientId,
            barberId: (appt as any).barberId,
            appointmentId: (appt as any).id,
            totalAmount: new Prisma.Decimal(0),
          } as any,
          select: { id: true },
        });
      } else {
        await tx.order.update({
          where: { id: order.id } as any,
          data: {
            status: "PENDING",
            companyId,
            unitId: (appt as any).unitId,
            clientId: (appt as any).clientId,
            barberId: (appt as any).barberId,
          } as any,
        });
      }

      const unitPrice = ((appt as any).servicePriceAtTheTime ??
        new Prisma.Decimal(0)) as Prisma.Decimal;

      const existingItem = await tx.orderItem.findFirst({
        where: {
          orderId: order.id,
          serviceId: (appt as any).serviceId,
          ...(companyId ? { companyId } : {}),
        } as any,
        select: { id: true },
      });

      if (!existingItem) {
        await createOrderItemCompat(
          tx,
          {
            orderId: order.id,
            serviceId: (appt as any).serviceId,
            quantity: 1,
            unitPrice,
            totalPrice: unitPrice,
          },
          companyId,
        );
      }

      const agg = await tx.orderItem.aggregate({
        where: {
          orderId: order.id,
          ...(companyId ? { companyId } : {}),
        } as any,
        _sum: { totalPrice: true },
      });

      await tx.order.update({
        where: { id: order.id } as any,
        data: {
          totalAmount: agg._sum.totalPrice ?? new Prisma.Decimal(0),
        } as any,
      });

      return appt;
    });

    // ✅ NÍVEL DO CLIENTE (on-demand) fora da transação
    try {
      if ((apptAfter as any).clientId && (apptAfter as any).unitId) {
        await ensureCustomerLevelUpToDate({
          userId: (apptAfter as any).clientId,
          unitId: (apptAfter as any).unitId,
        });
      }
    } catch (e) {
      console.error("[concludeAppointment] level engine error:", e);
    }

    return { ok: true };
  }, "Falha ao concluir o atendimento");
}

/* ---------------------------------------------------------
 * ✅ CANCELAR AGENDAMENTO (ADMIN/BARBER)
 * ✅ tenant-safe
 * ✅ taxa
 * ✅ auditoria
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

  if (auth.role !== "ADMIN" && auth.role !== "BARBER") {
    return { error: "Sem permissão para cancelar este agendamento" };
  }

  const companyId = await resolveCompanyIdForActorOrThrow({
    actorRole: auth.role,
    actorUserId: auth.userId,
    actorEmail: auth.email,
  });

  const cancelledByRole: RoleForAction =
    (parsed.data.cancelledByRole as RoleForAction | undefined) ?? auth.role;

  const applyFeeRequested = !!parsed.data.applyFee;

  // ✅ auditoria: ator real
  const actorUserId = auth.userId;
  const actorBarberId = await getBarberIdForActor({
    actorRole: auth.role,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    companyId, // ✅ evita barber de outra empresa
  });

  const existing = await getAppointmentInCompanyOrThrow({
    appointmentId,
    companyId,
    select: {
      id: true,
      status: true,
      unitId: true,
      barberId: true,
      scheduleAt: true,
      servicePriceAtTheTime: true,
      serviceId: true,
    } as any,
  });

  if ((existing as any).status === "CANCELED") {
    return { error: "Agendamento já está cancelado" };
  }
  if ((existing as any).status === "DONE") {
    return { error: "Não é possível cancelar um agendamento concluído" };
  }

  const hasOrder = await prisma.order.findFirst({
    where: { appointmentId, companyId } as any,
    select: { id: true },
  });

  if (hasOrder) {
    return { error: "Não é possível cancelar um atendimento já concluído" };
  }

  let cancelFeePercentage: number | null = null;
  let cancelLimitHours: number | null = null;

  if ((existing as any).serviceId) {
    const svc = await prisma.service.findFirst({
      where: { id: (existing as any).serviceId, companyId } as any,
      select: { cancelFeePercentage: true, cancelLimitHours: true },
    });

    if ((svc as any)?.cancelFeePercentage != null) {
      const pctAny = (svc as any).cancelFeePercentage;
      cancelFeePercentage =
        typeof pctAny === "number"
          ? pctAny
          : typeof pctAny?.toNumber === "function"
            ? pctAny.toNumber()
            : Number(pctAny);
    }

    if ((svc as any)?.cancelLimitHours != null) {
      cancelLimitHours = (svc as any).cancelLimitHours;
    }
  }

  const price = (existing as any)
    .servicePriceAtTheTime as Prisma.Decimal | null;

  let cancelFeeValue: Prisma.Decimal | null = null;
  let cancelFeeApplied = false;

  if (
    applyFeeRequested &&
    price &&
    cancelFeePercentage != null &&
    Number(cancelFeePercentage) > 0 &&
    cancelLimitHours != null &&
    cancelLimitHours > 0
  ) {
    const now = new Date().getTime();
    const scheduleTime = new Date((existing as any).scheduleAt).getTime();
    const diffHours = (scheduleTime - now) / (1000 * 60 * 60);

    const insideWindow = diffHours < cancelLimitHours;

    if (insideWindow) {
      cancelFeeValue = price
        .mul(new Prisma.Decimal(cancelFeePercentage))
        .div(new Prisma.Decimal(100));
      cancelFeeApplied = cancelFeeValue.gt(new Prisma.Decimal(0));
    }
  }

  return withAppointmentMutation(async () => {
    await prisma.$transaction(async (tx) => {
      const upd = await tx.appointment.updateMany({
        where: { id: appointmentId, companyId } as any,
        data: {
          status: "CANCELED",
          cancelledByRole,
          cancelFeeValue,
          cancelFeeApplied,

          ...(auth.role === "ADMIN" && actorUserId
            ? { cancelledByUserId: actorUserId }
            : {}),
          ...(auth.role === "BARBER" && actorBarberId
            ? { cancelledByBarberId: actorBarberId }
            : {}),
        } as any,
      });

      if ((upd as any).count !== 1) {
        throw new Error("Agendamento não encontrado");
      }

      if (cancelFeeApplied && cancelFeeValue && (existing as any).barberId) {
        await tx.barberCancellationFee.upsert({
          where: { appointmentId } as any,
          update: { amount: cancelFeeValue } as any,
          create: {
            appointmentId,
            barberId: (existing as any).barberId,
            unitId: (existing as any).unitId,
            companyId,
            amount: cancelFeeValue,
          } as any,
        });
      }
    });

    return { ok: true };
  }, "Falha ao cancelar o agendamento");
}

/* ---------------------------------------------------------
 * CREATE (tenant-safe)
 * ---------------------------------------------------------*/
export async function createAppointment(data: AppointmentData) {
  const parsed = appointmentSchema.parse(data);

  const auth = await getRoleFromPainelSession();
  if (auth.role !== "ADMIN" && auth.role !== "BARBER") {
    return { error: "Sem permissão para criar agendamento" };
  }

  const companyId = await resolveCompanyIdForActorOrThrow({
    actorRole: auth.role,
    actorUserId: auth.userId,
    actorEmail: auth.email,
  });

  console.log("[createAppointment] parsed:", {
    companyId,
    unitId: parsed.unitId ?? null,
    serviceId: parsed.serviceId,
    barberId: parsed.barberId,
    clientId: parsed.clientId ?? null,
    scheduleAt: parsed.scheduleAt,
    phone: parsed.phone,
    description: parsed.description,
  });

  const { scheduleAt, barberId, serviceId } = parsed;

  const pastError = validateNotInPast(scheduleAt);
  if (pastError) return { error: pastError };

  const service = await prisma.service.findFirst({
    where: { id: serviceId, companyId } as any,
    select: {
      id: true,
      price: true,
      barberPercentage: true,
      isActive: true,
      durationMinutes: true,
    },
  });

  console.log("[createAppointment] service:", {
    id: (service as any)?.id ?? null,
    isActive: (service as any)?.isActive ?? null,
    durationMinutes: (service as any)?.durationMinutes ?? null,
  });

  if (!service) return { error: "Serviço não encontrado" };
  if (!(service as any).isActive) return { error: "Serviço inativo" };

  const unitId = parsed.unitId;
  if (!unitId) return { error: "Unidade é obrigatória para este agendamento" };

  await ensureUnitBelongsToCompanyOrThrow(unitId, companyId);

  const unitHoursError = await validateWithinUnitHours({
    unitId,
    companyId,
    scheduleAt,
    durationMinutes: (service as any).durationMinutes ?? 0,
  });
  if (unitHoursError) return { error: unitHoursError };

  console.log("[createAppointment] ✅ unit ok", {
    companyId,
    unitId,
    serviceId: (service as any).id,
    barberId,
  });

  const linkError = await ensureBarberLinkedToUnit({
    barberId,
    unitId,
    companyId,
  });
  if (linkError) return { error: linkError };

  const canDoError = await ensureBarberCanDoService({
    barberId,
    serviceId,
    companyId,
  });
  if (canDoError) return { error: canDoError };

  const availabilityError = await ensureAvailability({
    scheduleAt,
    barberId,
    durationMinutes: (service as any).durationMinutes ?? 0,
    companyId,
  });
  if (availabilityError) return { error: availabilityError };

  const clientId = await getClientIdForAppointment({
    phoneDigits: parsed.phone,
    explicitClientId: parsed.clientId,
    companyId,
  });

  let servicePriceAtTheTime = (service as any).price as any;
  let barberPercentageAtTheTime = (service as any).barberPercentage as any;
  let barberEarningValue = (service as any).price
    .mul((service as any).barberPercentage)
    .div(new Prisma.Decimal(100));

  let clientPlanId: string | null = null;

  if (clientId) {
    const clientPlan = await prisma.clientPlan.findFirst({
      where: {
        companyId,
        clientId,
        status: "ACTIVE",
        startDate: { lte: scheduleAt },
        endDate: { gte: scheduleAt },
      } as any,
      include: { plan: true },
    });

    if (clientPlan && (clientPlan as any).plan?.isActive) {
      const totalBookings = (clientPlan as any).plan.totalBookings;

      if ((clientPlan as any).usedBookings < totalBookings) {
        const appointmentsUsingPlanCount = await prisma.appointment.count({
          where: {
            companyId,
            clientPlanId: (clientPlan as any).id,
            status: { not: "CANCELED" },
          } as any,
        });

        if (appointmentsUsingPlanCount < totalBookings) {
          const planHasService = await prisma.planService.findFirst({
            where: {
              planId: (clientPlan as any).planId,
              serviceId,
              plan: { companyId } as any,
            } as any,
          });

          if (planHasService) {
            clientPlanId = (clientPlan as any).id;

            const commissionPercentDecimal = new Prisma.Decimal(
              (clientPlan as any).plan.commissionPercent,
            );

            const totalCommissionValue = (clientPlan as any).plan.price
              .mul(commissionPercentDecimal)
              .div(new Prisma.Decimal(100));

            const perBooking = totalCommissionValue.div(
              new Prisma.Decimal(totalBookings),
            );

            servicePriceAtTheTime = (clientPlan as any).plan.price;
            barberPercentageAtTheTime = commissionPercentDecimal as any;
            barberEarningValue = perBooking as any;
          }
        }
      }
    }
  }

  return withAppointmentMutation(async () => {
    await prisma.appointment.create({
      data: {
        companyId,

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
      } as any,
    });

    // garante vínculo do cliente com a company (quando for “novo” via telefone, etc)
    if (clientId) {
      await ensureClientMembership({ userId: clientId, companyId });
    }

    return { ok: true };
  }, "Falha ao criar o agendamento");
}

/* ---------------------------------------------------------
 * UPDATE (tenant-safe)
 * ---------------------------------------------------------*/
export async function updateAppointment(id: string, data: AppointmentData) {
  const parsed = appointmentSchema.parse(data);
  const { scheduleAt, barberId, serviceId } = parsed;

  const auth = await getRoleFromPainelSession();
  if (auth.role !== "ADMIN" && auth.role !== "BARBER") {
    return { error: "Sem permissão para atualizar agendamento" };
  }

  const companyId = await resolveCompanyIdForActorOrThrow({
    actorRole: auth.role,
    actorUserId: auth.userId,
    actorEmail: auth.email,
  });

  const pastError = validateNotInPast(scheduleAt);
  if (pastError) return { error: pastError };

  const existing = await getAppointmentInCompanyOrThrow({
    appointmentId: id,
    companyId,
    select: {
      id: true,
      unitId: true,
      clientPlanId: true,
      serviceId: true,
      servicePriceAtTheTime: true,
      barberPercentageAtTheTime: true,
      barberEarningValue: true,
    } as any,
  });

  const appointmentUsesPlan = (existing as any).clientPlanId !== null;

  let servicePriceAtTheTime = (existing as any).servicePriceAtTheTime;
  let barberPercentageAtTheTime = (existing as any).barberPercentageAtTheTime;
  let barberEarningValue = (existing as any).barberEarningValue;

  const targetService = await prisma.service.findFirst({
    where: { id: serviceId, companyId } as any,
    select: {
      id: true,
      price: true,
      barberPercentage: true,
      durationMinutes: true,
      isActive: true,
    },
  });

  if (!targetService) return { error: "Serviço não encontrado" };
  if (!(targetService as any).isActive) return { error: "Serviço inativo" };

  if (
    !appointmentUsesPlan &&
    (!(existing as any).serviceId || (existing as any).serviceId !== serviceId)
  ) {
    servicePriceAtTheTime = (targetService as any).price;
    barberPercentageAtTheTime = (targetService as any).barberPercentage;
    barberEarningValue = (targetService as any).price
      .mul((targetService as any).barberPercentage)
      .div(new Prisma.Decimal(100));
  }

  const unitId = parsed.unitId ?? (existing as any).unitId;
  if (!unitId) return { error: "Unidade é obrigatória para este agendamento" };

  await ensureUnitBelongsToCompanyOrThrow(unitId, companyId);

  const unitHoursError = await validateWithinUnitHours({
    unitId,
    companyId,
    scheduleAt,
    durationMinutes: (targetService as any).durationMinutes ?? 0,
  });
  if (unitHoursError) return { error: unitHoursError };

  console.log("[updateAppointment] ✅ unit ok", {
    companyId,
    appointmentId: id,
    unitId,
    serviceId: (targetService as any).id,
    barberId,
  });

  const linkError = await ensureBarberLinkedToUnit({
    barberId,
    unitId,
    companyId,
  });
  if (linkError) return { error: linkError };

  const canDoError = await ensureBarberCanDoService({
    barberId,
    serviceId,
    companyId,
  });
  if (canDoError) return { error: canDoError };

  const availabilityError = await ensureAvailability({
    scheduleAt,
    barberId,
    durationMinutes: (targetService as any).durationMinutes ?? 0,
    companyId,
    excludeId: id,
  });
  if (availabilityError) return { error: availabilityError };

  return withAppointmentMutation(async () => {
    const upd = await prisma.appointment.updateMany({
      where: { id, companyId } as any,
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
      } as any,
    });

    if ((upd as any).count !== 1) {
      return { error: "Agendamento não encontrado" };
    }

    return { ok: true };
  }, "Falha ao atualizar o agendamento");
}

/* ---------------------------------------------------------
 * DELETE (tenant-safe)
 * ---------------------------------------------------------*/
export async function deleteAppointment(id: string) {
  const auth = await getRoleFromPainelSession();
  if (auth.role !== "ADMIN" && auth.role !== "BARBER") {
    return { error: "Sem permissão para excluir agendamento" };
  }

  const companyId = await resolveCompanyIdForActorOrThrow({
    actorRole: auth.role,
    actorUserId: auth.userId,
    actorEmail: auth.email,
  });

  return withAppointmentMutation(async () => {
    const del = await prisma.appointment.deleteMany({
      where: { id, companyId } as any,
    });

    if ((del as any).count !== 1) {
      return { error: "Agendamento não encontrado" };
    }

    return { ok: true };
  }, "Falha ao excluir o agendamento");
}

/* ---------------------------------------------------------
 * DISPONIBILIDADE DO BARBEIRO
 * (tenant-safe: valida unitId quando vier)
 * ---------------------------------------------------------*/
export async function getAvailabilityWindowsForBarberOnDateAction(
  barberId: string,
  dateISO: string,
  unitId?: string,
) {
  const auth = await getRoleFromPainelSession();
  if (auth.role !== "ADMIN" && auth.role !== "BARBER") {
    throw new Error("Sem permissão");
  }

  const companyId = await resolveCompanyIdForActorOrThrow({
    actorRole: auth.role,
    actorUserId: auth.userId,
    actorEmail: auth.email,
  });

  const date = new Date(dateISO);

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      "Data inválida recebida em getAvailabilityWindowsForBarberOnDateAction",
    );
  }

  if (unitId) {
    await ensureUnitBelongsToCompanyOrThrow(unitId, companyId);
  }

  const windows = await getAvailabilityWindowsForBarberOnDate(barberId, date, {
    unitId,
  });

  return windows ?? null;
}

/* ---------------------------------------------------------
 * BARBEIROS DISPONÍVEIS PARA UMA DATA (compat)
 * ✅ reforça filtro por BarberUnit quando unitId vier
 * ✅ tenant-safe: valida unitId e filtra por unit.companyId
 * ---------------------------------------------------------*/
export async function getAvailableBarbersForDateAction(
  dateISO: string,
  unitId?: string,
) {
  const auth = await getRoleFromPainelSession();
  if (auth.role !== "ADMIN" && auth.role !== "BARBER") {
    throw new Error("Sem permissão");
  }

  const companyId = await resolveCompanyIdForActorOrThrow({
    actorRole: auth.role,
    actorUserId: auth.userId,
    actorEmail: auth.email,
  });

  const date = new Date(dateISO);

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      "Data inválida recebida em getAvailableBarbersForDateAction",
    );
  }

  if (unitId) {
    await ensureUnitBelongsToCompanyOrThrow(unitId, companyId);
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
                unit: { companyId } as any,
              },
            },
          }
        : {
            // sem unitId: pelo menos garante que o barbeiro tem algum vínculo ativo em units da company
            units: {
              some: {
                isActive: true,
                unit: { companyId } as any,
              },
            },
          }),
    } as any,
    include: {
      services: {
        select: { serviceId: true },
      },
    },
  });

  const allowedIds = new Set(prismaBarbers.map((b) => b.id));

  const servicesMap = new Map<string, string[]>(
    prismaBarbers.map((b) => [
      b.id,
      (b as any).services.map((s: any) => s.serviceId),
    ]),
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
 * ✅ tenant-safe: unit.companyId + service.companyId
 * ---------------------------------------------------------*/
export async function getAvailableBarbersForDateAndServiceAction(
  dateISO: string,
  unitId: string,
  serviceId: string,
) {
  const auth = await getRoleFromPainelSession();
  if (auth.role !== "ADMIN" && auth.role !== "BARBER") {
    throw new Error("Sem permissão");
  }

  const companyId = await resolveCompanyIdForActorOrThrow({
    actorRole: auth.role,
    actorUserId: auth.userId,
    actorEmail: auth.email,
  });

  const date = new Date(dateISO);

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      "Data inválida recebida em getAvailableBarbersForDateAndServiceAction",
    );
  }

  if (!unitId) return [];
  if (!serviceId) return [];

  await ensureUnitBelongsToCompanyOrThrow(unitId, companyId);

  // garante service na company (se service tiver companyId)
  const svcOk = await prisma.service.findFirst({
    where: { id: serviceId, companyId } as any,
    select: { id: true },
  });
  if (!svcOk) return [];

  const candidates = await prisma.barber.findMany({
    where: {
      isActive: true,
      units: {
        some: {
          unitId,
          isActive: true,
          unit: { companyId } as any,
        },
      },
      services: {
        some: {
          serviceId,
        },
      },
    } as any,
    include: {
      services: { select: { serviceId: true } },
    },
    orderBy: { name: "asc" },
  });

  if (candidates.length === 0) return [];

  const available: any[] = [];
  for (const barber of candidates) {
    const windows = await getAvailabilityWindowsForBarberOnDate(
      barber.id,
      date,
      {
        unitId,
      },
    );

    if (windows && windows.length > 0) {
      available.push(barber);
    }
  }

  return available.map((b) => ({
    id: b.id,
    name: b.name,
    email: b.email,
    phone: b.phone ?? "",
    isActive: b.isActive,
    role: "BARBER" as const,
    serviceIds: (b as any).services.map((s: any) => s.serviceId),
  }));
}

/* ---------------------------------------------------------
 * ✅ NOVO: BUSCA DE CLIENTES (ADMIN/APPOINTMENTS)
 * - tenant-safe (companyId obrigatório)
 * - filtra por membership na company
 * - busca por nome/email/telefone (normalizado)
 * - retorna no formato do AppointmentForm
 * ---------------------------------------------------------*/
const searchClientsSchema = z.object({
  q: z.string().optional(),
  take: z.coerce.number().min(1).max(50).optional(),
});

export async function searchClientsForAdminAppointmentsAction(input?: {
  q?: string;
  take?: number;
}): Promise<Array<{ id: string; name: string; phone: string }>> {
  const parsed = searchClientsSchema.safeParse(input ?? {});
  if (!parsed.success) {
    console.log("[searchClients] ❌ invalid input", input);
    return [];
  }

  const auth = await getRoleFromPainelSession();
  if (auth.role !== "ADMIN" && auth.role !== "BARBER") {
    console.log("[searchClients] ❌ no permission", {
      role: auth.role,
      source: auth.source,
    });
    return [];
  }

  const companyId = await resolveCompanyIdForActorOrThrow({
    actorRole: auth.role,
    actorUserId: auth.userId,
    actorEmail: auth.email,
  });

  const qRaw = String(parsed.data.q ?? "").trim();
  const take = parsed.data.take ?? 20;

  const qLower = qRaw.toLowerCase();
  const qDigits = normalizePhone(qRaw);

  const anonEmail = `anon+${companyId}@barbearia.local`;

  console.log("[searchClients] ▶️ start", {
    source: auth.source,
    role: auth.role,
    userId: auth.userId,
    companyId,
    qRaw,
    take,
    qDigits,
  });

  // 🔎 Debug específico pro caso "jose"
  if (qLower.includes("jose")) {
    const dbg = await prisma.user.findMany({
      where: {
        role: "CLIENT",
        isActive: true,
        OR: [
          { name: { contains: "jose", mode: "insensitive" } },
          { name: { contains: "José", mode: "insensitive" } },
        ],
      } as any,
      select: { id: true, name: true, email: true, phone: true } as any,
      take: 20,
    });

    console.log(
      "[searchClients] 🧪 debug users(name contains jose) (no tenant filter)",
      dbg,
    );

    const dbg2 = await prisma.user.findMany({
      where: {
        role: "CLIENT",
        isActive: true,
        companyMemberships: { some: { companyId, isActive: true } },
        OR: [
          { name: { contains: "jose", mode: "insensitive" } },
          { name: { contains: "José", mode: "insensitive" } },
        ],
      } as any,
      select: { id: true, name: true, email: true, phone: true } as any,
      take: 20,
    });

    console.log(
      "[searchClients] 🧪 debug users(name contains jose) (WITH membership filter)",
      dbg2,
    );
  }

  // --------------------------------------------
  // 1) se não tem query: devolve “recentes” via appointments
  // --------------------------------------------
  if (!qRaw) {
    const recent = await prisma.appointment.findMany({
      where: { companyId } as any,
      orderBy: { createdAt: "desc" as any },
      take: Math.min(50, take * 3),
      select: {
        clientId: true,
        clientName: true,
        phone: true,
      } as any,
    });

    console.log("[searchClients] recent appointments:", recent.length);

    const ids = Array.from(
      new Set(recent.map((r: any) => r.clientId).filter(Boolean)),
    ) as string[];

    const users = ids.length
      ? await prisma.user.findMany({
          where: {
            id: { in: ids },
            role: "CLIENT",
            isActive: true,
            email: { not: anonEmail },
            companyMemberships: { some: { companyId, isActive: true } },
          } as any,
          select: { id: true, name: true, phone: true } as any,
        })
      : [];

    console.log("[searchClients] recent users resolved:", users.length);

    const map = new Map(users.map((u: any) => [u.id, u]));

    const out: Array<{ id: string; name: string; phone: string }> = [];
    for (const r of recent) {
      const id = (r as any).clientId as string | null;
      if (!id) continue;
      if (out.some((x) => x.id === id)) continue;

      const u = map.get(id);
      out.push({
        id,
        name: (u?.name ?? (r as any).clientName ?? "").trim(),
        phone: (u?.phone ?? (r as any).phone ?? "").trim(),
      });

      if (out.length >= take) break;
    }

    console.log(
      "[searchClients] ✅ return recent:",
      out.length,
      out.slice(0, 5),
    );
    return out;
  }

  // --------------------------------------------
  // 2) com query: busca users da company + fallback por histórico de appointments
  // --------------------------------------------

  const usersInCompany = await prisma.user.findMany({
    where: {
      role: "CLIENT",
      isActive: true,
      email: { not: anonEmail },
      companyMemberships: { some: { companyId, isActive: true } },
      OR: [
        { name: { contains: qRaw, mode: "insensitive" } },
        { email: { contains: qLower, mode: "insensitive" } },
        ...(qDigits
          ? [{ phone: { contains: qDigits } }, { phone: { contains: qRaw } }]
          : []),
      ],
    } as any,
    orderBy: { name: "asc" },
    take,
    select: { id: true, name: true, phone: true } as any,
  });

  console.log(
    "[searchClients] usersInCompany:",
    usersInCompany.length,
    usersInCompany.slice(0, 5),
  );

  if (usersInCompany.length >= take) {
    const out = usersInCompany.map((c: any) => ({
      id: c.id,
      name: c.name ?? "",
      phone: c.phone ?? "",
    }));
    console.log(
      "[searchClients] ✅ return usersInCompany (enough):",
      out.length,
    );
    return out;
  }

  const apptHits = await prisma.appointment.findMany({
    where: {
      companyId,
      status: { not: "CANCELED" },
      OR: [
        { clientName: { contains: qRaw, mode: "insensitive" } as any },
        ...(qDigits
          ? [
              { phone: { contains: qDigits } as any },
              { phone: { contains: qRaw } as any },
            ]
          : []),
      ],
    } as any,
    orderBy: { scheduleAt: "desc" },
    take: Math.min(100, take * 4),
    select: {
      clientId: true,
      clientName: true,
      phone: true,
    } as any,
  });

  console.log(
    "[searchClients] apptHits:",
    apptHits.length,
    apptHits.slice(0, 5),
  );

  const foundIds = new Set(usersInCompany.map((u: any) => u.id));

  const extraIds = Array.from(
    new Set(apptHits.map((a: any) => a.clientId).filter(Boolean)),
  )
    .filter((id) => !foundIds.has(id))
    .slice(0, take);

  console.log(
    "[searchClients] extraIds:",
    extraIds.length,
    extraIds.slice(0, 10),
  );

  const extraUsers = extraIds.length
    ? await prisma.user.findMany({
        where: {
          id: { in: extraIds },
          role: "CLIENT",
          isActive: true,
          email: { not: anonEmail },
        } as any,
        select: { id: true, name: true, phone: true } as any,
      })
    : [];

  console.log(
    "[searchClients] extraUsers:",
    extraUsers.length,
    extraUsers.slice(0, 5),
  );

  const extraMap = new Map(extraUsers.map((u: any) => [u.id, u]));

  const merged: Array<{ id: string; name: string; phone: string }> = [
    ...usersInCompany.map((c: any) => ({
      id: c.id,
      name: c.name ?? "",
      phone: c.phone ?? "",
    })),
  ];

  for (const hit of apptHits) {
    const id = (hit as any).clientId as string | null;
    if (!id) continue;
    if (merged.some((x) => x.id === id)) continue;

    const u = extraMap.get(id);
    merged.push({
      id,
      name: (u?.name ?? (hit as any).clientName ?? "").trim(),
      phone: (u?.phone ?? (hit as any).phone ?? "").trim(),
    });

    if (merged.length >= take) break;
  }

  console.log(
    "[searchClients] ✅ return merged:",
    merged.length,
    merged.slice(0, 10),
  );
  return merged;
}
