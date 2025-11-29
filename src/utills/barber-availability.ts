// src/utills/barber-availability.ts
import { prisma } from "@/lib/prisma";
import { addDays, startOfDay } from "date-fns";

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
