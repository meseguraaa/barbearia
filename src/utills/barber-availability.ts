// src/utills/barber-availability.ts
import { prisma } from "@/lib/prisma";
import { addDays, startOfDay, addMinutes } from "date-fns";

// Janela de disponibilidade simples: começo/fim em "HH:mm"
export type AvailabilityWindow = {
  startTime: string;
  endTime: string;
};

/**
 * Calcula as janelas de disponibilidade de um barbeiro em um dia específico.
 *
 * Regras:
 * 1. Se houver BarberDailyAvailability para o dia:
 *    - type = DAY_OFF  → retorna []
 *    - type = CUSTOM   → usa os intervals diários
 * 2. Senão, usa o padrão semanal (BarberWeeklyAvailability):
 *    - Se isActive = true e tiver intervals → usa esses intervals
 *    - Senão → retorna []
 */
export async function getAvailabilityWindowsForBarberOnDate(
  barberId: string,
  date: Date,
): Promise<AvailabilityWindow[] | undefined> {
  const dayStart = startOfDay(date);
  const nextDay = addDays(dayStart, 1);

  // 1) Tenta achar uma disponibilidade diária (exceção) para esse dia
  const daily = await prisma.barberDailyAvailability.findFirst({
    where: {
      barberId,
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
    // DAY_OFF → sem disponibilidade nenhuma nesse dia
    if (daily.type === "DAY_OFF") {
      return [];
    }

    // CUSTOM → usa apenas os intervals desse dia
    if (daily.type === "CUSTOM") {
      const sorted = [...daily.intervals].sort((a, b) =>
        a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0,
      );

      return sorted.map((interval) => ({
        startTime: interval.startTime,
        endTime: interval.endTime,
      }));
    }
  }

  // 2) Sem exceção diária → cai no padrão semanal
  const weekday = date.getDay(); // 0 = domingo ... 6 = sábado

  const weekly = await prisma.barberWeeklyAvailability.findFirst({
    where: {
      barberId,
      weekday,
      isActive: true,
    },
    include: {
      intervals: true,
    },
  });

  if (!weekly || weekly.intervals.length === 0) {
    // Sem padrão semanal ativo ou sem intervalos → sem disponibilidade
    return [];
  }

  const sortedWeekly = [...weekly.intervals].sort((a, b) =>
    a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0,
  );

  return sortedWeekly.map((interval) => ({
    startTime: interval.startTime,
    endTime: interval.endTime,
  }));
}

/**
 * Retorna barbeiros que têm ALGUMA disponibilidade nesse dia,
 * já considerando:
 *  - padrão semanal
 *  - + exceções diárias (DAY_OFF / CUSTOM)
 */
export async function getAvailableBarbersOnDate(date: Date) {
  // Pega todos os barbeiros ativos
  const barbers = await prisma.barber.findMany({
    where: {
      isActive: true,
    },
  });

  const result: typeof barbers = [];

  for (const barber of barbers) {
    const windows = await getAvailabilityWindowsForBarberOnDate(
      barber.id,
      date,
    );

    // se não tiver janelas ou tiver lista vazia → não entra
    if (!windows || windows.length === 0) {
      continue;
    }

    result.push(barber);
  }

  return result;
}

/* ------------------------------------------------------------------
 * NOVO: cálculo de horários disponíveis considerando DURAÇÃO do serviço
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
  // há sobreposição se um começa antes do outro terminar
  // e termina depois do outro começar
  return startA < endB && endA > startB;
}

type GetAvailableTimeSlotsOptions = {
  serviceDurationInMinutes: number;
  /**
   * de quantos em quantos minutos você quer gerar os horários
   * Ex: 30 → 09:00, 09:30, 10:00...
   */
  slotIntervalInMinutes?: number;
};

/**
 * Gera a lista de horários possíveis para agendar um serviço
 * em um barbeiro em um dia, considerando:
 *
 *  - janelas de disponibilidade (weekly + daily)
 *  - agendamentos já existentes do barbeiro (no mesmo dia)
 *  - duração do serviço (serviceDurationInMinutes)
 *
 * Exemplo:
 *  - Serviço: 60min
 *  - Agendamento existente: 09:00 → 10:00
 *  => NÃO vai retornar 09:00, 09:30. Primeiro horário livre: 10:00.
 */
export async function getAvailableTimeSlotsForBarberOnDate(
  barberId: string,
  date: Date,
  {
    serviceDurationInMinutes,
    slotIntervalInMinutes = 30,
  }: GetAvailableTimeSlotsOptions,
): Promise<string[]> {
  const windows = await getAvailabilityWindowsForBarberOnDate(barberId, date);

  if (!windows || windows.length === 0) {
    return [];
  }

  const dayStart = startOfDay(date);
  const nextDay = addDays(dayStart, 1);

  // Agendamentos existentes do barbeiro nesse dia
  const appointments = await prisma.appointment.findMany({
    where: {
      barberId,
      scheduleAt: {
        gte: dayStart,
        lt: nextDay,
      },
    },
    include: {
      service: true, // assumindo que o Appointment tem relação com Service
    },
  });

  // Monta intervalos ocupados: [start, end)
  const busyIntervals = appointments
    .map((appt) => {
      const start = appt.scheduleAt;
      const duration =
        // se tiver duração no serviço, usamos
        // (ajuste aqui se você salva a duração direto no appointment)
        // @ts-ignore – em tempo de execução isso existe
        appt.service?.durationInMinutes ??
        // fallback genérico: 30min caso não exista
        30;

      const end = addMinutes(start, duration);
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

      // verifica se conflita com algum intervalo ocupado
      const hasConflict = busyIntervals.some((busy) =>
        intervalsOverlap(slotStart, slotEnd, busy.start, busy.end),
      );

      if (!hasConflict) {
        availableSlots.push(formatTime(slotStart));
      }

      // próxima iteração (ex: de 30 em 30 minutos)
      slotStart = addMinutes(slotStart, slotIntervalInMinutes);
    }
  }

  return availableSlots;
}
