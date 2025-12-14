// src/utills/barber-availability.ts
import { prisma } from "@/lib/prisma";
import { addDays, startOfDay, addMinutes } from "date-fns";

// Janela de disponibilidade simples: começo/fim em "HH:mm"
export type AvailabilityWindow = {
  startTime: string;
  endTime: string;
};

type GetAvailabilityWindowsOptions = {
  /**
   * ✅ Multi-unidade:
   * Se informado, tenta:
   * 1) disponibilidade do BARBEIRO na unidade (daily/weekly)
   * 2) fallback: disponibilidade da UNIDADE (daily/weekly)
   */
  unitId?: string;
};

/* ---------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/
function sortIntervals<T extends { startTime: string; endTime: string }>(
  arr: T[],
) {
  return [...arr].sort((a, b) =>
    a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0,
  );
}

async function ensureBarberLinkedToUnit(barberId: string, unitId: string) {
  const link = await prisma.barberUnit.findFirst({
    where: { barberId, unitId, isActive: true },
    select: { id: true },
  });
  return !!link;
}

/* ---------------------------------------------------------
 * Fallback: disponibilidade da UNIDADE
 * ---------------------------------------------------------*/
async function getUnitAvailabilityWindowsOnDate(
  unitId: string,
  date: Date,
): Promise<AvailabilityWindow[] | undefined> {
  const dayStart = startOfDay(date);
  const nextDay = addDays(dayStart, 1);

  // 1) Exceção diária da unidade
  const daily = await prisma.unitDailyAvailability.findFirst({
    where: {
      unitId,
      date: {
        gte: dayStart,
        lt: nextDay,
      },
    },
    include: {
      intervals: true,
    },
  });

  if (daily) {
    // unidade fechada
    if (daily.isClosed) return [];

    // se tem intervals, usa eles
    if (daily.intervals && daily.intervals.length > 0) {
      const sorted = sortIntervals(daily.intervals);
      return sorted.map((i) => ({
        startTime: i.startTime,
        endTime: i.endTime,
      }));
    }

    // daily existe mas não tem intervalos e não está fechada:
    // cai pro weekly da unidade (abaixo)
  }

  // 2) Weekly da unidade
  const weekday = date.getDay(); // 0..6
  const weekly = await prisma.unitWeeklyAvailability.findFirst({
    where: {
      unitId,
      weekday,
      isActive: true,
    },
    include: {
      intervals: true,
    },
  });

  if (!weekly || !weekly.intervals || weekly.intervals.length === 0) return [];

  const sortedWeekly = sortIntervals(weekly.intervals);
  return sortedWeekly.map((i) => ({
    startTime: i.startTime,
    endTime: i.endTime,
  }));
}

/**
 * Calcula as janelas de disponibilidade de um barbeiro em um dia específico.
 *
 * Regras:
 * 1. Se houver BarberDailyAvailability para o dia (na unidade):
 *    - type = DAY_OFF  → retorna []
 *    - type = CUSTOM   → usa os intervals diários
 * 2. Senão, usa o padrão semanal (BarberWeeklyAvailability) (na unidade):
 *    - Se isActive = true e tiver intervals → usa esses intervals
 *    - Senão → FALLBACK: usa disponibilidade da UNIDADE (daily/weekly)
 *
 * ✅ Se unitId vier, valida vínculo BarberUnit ativo.
 */
export async function getAvailabilityWindowsForBarberOnDate(
  barberId: string,
  date: Date,
  options?: GetAvailabilityWindowsOptions,
): Promise<AvailabilityWindow[] | undefined> {
  const dayStart = startOfDay(date);
  const nextDay = addDays(dayStart, 1);
  const unitId = options?.unitId;

  // Se veio unitId, o barbeiro precisa estar vinculado
  if (unitId) {
    const linked = await ensureBarberLinkedToUnit(barberId, unitId);
    if (!linked) return [];
  }

  // 1) Daily do barbeiro (na unidade se unitId informado)
  const daily = await prisma.barberDailyAvailability.findFirst({
    where: {
      barberId,
      ...(unitId ? { unitId } : {}),
      date: {
        gte: dayStart,
        lt: nextDay,
      },
    },
    include: {
      intervals: true,
    },
  });

  if (daily) {
    if (daily.type === "DAY_OFF") return [];

    if (daily.type === "CUSTOM") {
      const sorted = sortIntervals(daily.intervals ?? []);
      return sorted.map((i) => ({
        startTime: i.startTime,
        endTime: i.endTime,
      }));
    }
  }

  // 2) Weekly do barbeiro (na unidade se unitId informado)
  const weekday = date.getDay();
  const weekly = await prisma.barberWeeklyAvailability.findFirst({
    where: {
      barberId,
      ...(unitId ? { unitId } : {}),
      weekday,
      isActive: true,
    },
    include: {
      intervals: true,
    },
  });

  if (weekly && weekly.intervals && weekly.intervals.length > 0) {
    const sortedWeekly = sortIntervals(weekly.intervals);
    return sortedWeekly.map((i) => ({
      startTime: i.startTime,
      endTime: i.endTime,
    }));
  }

  // 3) ✅ FALLBACK: se pediram unitId, usa horário da UNIDADE
  if (unitId) {
    return await getUnitAvailabilityWindowsOnDate(unitId, date);
  }

  // Sem unitId e sem weekly do barbeiro = sem disponibilidade
  return [];
}

type GetAvailableBarbersOnDateOptions = {
  unitId?: string;
};

/**
 * Retorna barbeiros que têm ALGUMA disponibilidade nesse dia.
 *
 * ✅ Ajuste importante:
 * - Se unitId informado:
 *   - só considera barbeiros vinculados à unidade (BarberUnit.isActive=true)
 *   - janelas do barbeiro podem cair no fallback da unidade (se faltar weekly/intervals)
 */
export async function getAvailableBarbersOnDate(
  date: Date,
  options?: GetAvailableBarbersOnDateOptions,
) {
  const unitId = options?.unitId;

  // Pega barbeiros ativos (se unitId, somente vinculados à unidade)
  const barbers = await prisma.barber.findMany({
    where: {
      isActive: true,
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
  });

  const result: typeof barbers = [];

  for (const barber of barbers) {
    const windows = await getAvailabilityWindowsForBarberOnDate(
      barber.id,
      date,
      {
        unitId,
      },
    );

    if (!windows || windows.length === 0) continue;
    result.push(barber);
  }

  return result;
}

/* ------------------------------------------------------------------
 * Cálculo de horários disponíveis considerando DURAÇÃO do serviço
 * + anti-teletransporte (conflito por agendamento do barbeiro no dia)
 * ------------------------------------------------------------------ */

function parseTimeToDate(baseDate: Date, time: string): Date {
  const [hoursStr, minutesStr] = time.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);

  const d = new Date(baseDate);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function intervalsOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean {
  return startA < endB && endA > startB;
}

type GetAvailableTimeSlotsOptions = {
  serviceDurationInMinutes: number;
  slotIntervalInMinutes?: number;
  unitId?: string;
};

/**
 * Gera horários possíveis para agendar um serviço, considerando:
 * - janelas (barbeiro na unidade) com fallback (unidade)
 * - agendamentos existentes do barbeiro (qualquer unidade) ignorando cancelados
 */
export async function getAvailableTimeSlotsForBarberOnDate(
  barberId: string,
  date: Date,
  {
    serviceDurationInMinutes,
    slotIntervalInMinutes = 30,
    unitId,
  }: GetAvailableTimeSlotsOptions,
): Promise<string[]> {
  const windows = await getAvailabilityWindowsForBarberOnDate(barberId, date, {
    unitId,
  });

  if (!windows || windows.length === 0) return [];

  const dayStart = startOfDay(date);
  const nextDay = addDays(dayStart, 1);

  const appointments = await prisma.appointment.findMany({
    where: {
      barberId,
      status: { not: "CANCELED" },
      scheduleAt: {
        gte: dayStart,
        lt: nextDay,
      },
    },
    select: {
      scheduleAt: true,
      service: { select: { durationMinutes: true } },
    },
  });

  const busyIntervals = appointments
    .map((appt) => {
      const start = appt.scheduleAt;
      const duration = appt.service?.durationMinutes ?? 30;
      const end = addMinutes(start, Math.max(0, duration));
      return { start, end };
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const availableSlots: string[] = [];

  for (const window of windows) {
    const windowStart = parseTimeToDate(dayStart, window.startTime);
    const windowEnd = parseTimeToDate(dayStart, window.endTime);

    let slotStart = new Date(windowStart);

    while (
      addMinutes(slotStart, serviceDurationInMinutes).getTime() <=
      windowEnd.getTime()
    ) {
      const slotEnd = addMinutes(slotStart, serviceDurationInMinutes);

      const hasConflict = busyIntervals.some((busy) =>
        intervalsOverlap(slotStart, slotEnd, busy.start, busy.end),
      );

      if (!hasConflict) {
        availableSlots.push(formatTime(slotStart));
      }

      slotStart = addMinutes(slotStart, slotIntervalInMinutes);
    }
  }

  return availableSlots;
}
