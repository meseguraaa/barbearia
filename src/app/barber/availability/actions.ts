// src/app/barber/availability/actions.ts
"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import z from "zod";
import { getCurrentPainelUser } from "@/lib/painel-session";
import { AppointmentStatus } from "@prisma/client";

// ===== Tipos de entrada vindos do front =====

export type WeeklyDayInput = {
  weekday: number; // 0 = domingo ... 6 = sábado
  active: boolean;
  startTime: string; // "09:00"
  endTime: string; // "18:00"
};

export type SaveWeeklyAvailabilityInput = {
  days: WeeklyDayInput[];
};

// =========================================================
// CONTEXTO (tenant + barber + unit)
// - companyId vem do token (painel_session)
// - barber vem do userId do token
// - unit ativa deve pertencer à companyId do token
// =========================================================

async function getCurrentBarberContextOrThrow(): Promise<{
  barber: { id: string; email: string | null; userId: string | null };
  unitId: string;
  companyId: string;
}> {
  const session = await getCurrentPainelUser();

  if (!session) redirect("/painel/login");
  if (session.role !== "BARBER") redirect("/painel/login?error=permissao");
  if (!session.companyId) redirect("/painel/login?error=missing_company");

  // Barber vinculado ao usuário logado
  const barber = await prisma.barber.findUnique({
    where: { userId: session.sub },
    select: { id: true, email: true, userId: true },
  });

  if (!barber) throw new Error("Barber não encontrado para o usuário logado.");

  // Unidade ativa do barbeiro DENTRO da empresa da sessão
  const active = await prisma.barberUnit.findFirst({
    where: {
      barberId: barber.id,
      isActive: true,
      unit: {
        isActive: true,
        companyId: session.companyId,
      },
    },
    select: {
      unit: { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const unitId = active?.unit?.id;

  if (!unitId) {
    throw new Error("Este profissional não possui unidade ativa vinculada.");
  }

  return { barber, unitId, companyId: session.companyId };
}

// =========================================================
// Action principal: salvar padrão semanal
// =========================================================

export async function saveWeeklyAvailability(
  input: SaveWeeklyAvailabilityInput,
) {
  const { barber, unitId, companyId } = await getCurrentBarberContextOrThrow();

  if (!input?.days || !Array.isArray(input.days)) {
    throw new Error("Payload inválido ao salvar disponibilidade semanal.");
  }

  const sanitizedDays = input.days
    .filter((day) => day.weekday >= 0 && day.weekday <= 6)
    .map((day) => ({
      weekday: day.weekday,
      active: !!day.active,
      startTime: day.startTime ?? "09:00",
      endTime: day.endTime ?? "18:00",
    }));

  const existing = await prisma.barberWeeklyAvailability.findMany({
    where: {
      barberId: barber.id,
      unitId,
      companyId,
    },
  });

  const existingByWeekday = new Map<number, (typeof existing)[number]>();
  for (const item of existing) existingByWeekday.set(item.weekday, item);

  for (const day of sanitizedDays) {
    const existingForDay = existingByWeekday.get(day.weekday);

    // 👉 DIA INATIVO
    if (!day.active) {
      if (existingForDay) {
        await prisma.barberWeeklyTimeInterval.deleteMany({
          where: { weeklyAvailabilityId: existingForDay.id },
        });

        await prisma.barberWeeklyAvailability.update({
          where: { id: existingForDay.id },
          data: { isActive: false },
        });
      } else {
        await prisma.barberWeeklyAvailability.create({
          data: {
            companyId,
            barberId: barber.id,
            unitId,
            weekday: day.weekday,
            isActive: false,
          },
        });
      }
      continue;
    }

    // 👉 DIA ATIVO
    let weeklyAvailabilityId = existingForDay?.id;

    if (existingForDay) {
      await prisma.barberWeeklyAvailability.update({
        where: { id: existingForDay.id },
        data: { isActive: true },
      });

      await prisma.barberWeeklyTimeInterval.deleteMany({
        where: { weeklyAvailabilityId: existingForDay.id },
      });
    } else {
      const created = await prisma.barberWeeklyAvailability.create({
        data: {
          companyId,
          barberId: barber.id,
          unitId,
          weekday: day.weekday,
          isActive: true,
        },
      });

      weeklyAvailabilityId = created.id;
    }

    if (!weeklyAvailabilityId) {
      throw new Error("Falha ao obter weeklyAvailabilityId.");
    }

    await prisma.barberWeeklyTimeInterval.create({
      data: {
        weeklyAvailabilityId,
        startTime: day.startTime,
        endTime: day.endTime,
      },
    });
  }

  revalidatePath("/barber/availability");
  revalidatePath("/painel/availability");
  return { success: true };
}

/* =========================================================
 * EXCEÇÕES DIÁRIAS (IN-DI-SPONIBILIDADE)
 * =======================================================*/

const dailyExceptionSchema = z.object({
  barberId: z.string().min(1).optional(),
  dateISO: z.string().min(1),
  mode: z.enum(["FULL_DAY", "PARTIAL"]),
  intervals: z
    .array(
      z.object({
        startTime: z.string(),
        endTime: z.string(),
      }),
    )
    .optional(),
});

export type DailyExceptionInput = z.infer<typeof dailyExceptionSchema>;

function timeStringToMinutes(time: string): number {
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr ?? "0");
  const m = Number(mStr ?? "0");
  return h * 60 + m;
}

function minutesToTimeString(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

type IntervalMinutes = { start: number; end: number };

function normalizeIntervals(intervals: IntervalMinutes[]): IntervalMinutes[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);

  const result: IntervalMinutes[] = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    if (next.start <= current.end)
      current.end = Math.max(current.end, next.end);
    else {
      result.push(current);
      current = { ...next };
    }
  }

  result.push(current);
  return result;
}

function subtractIntervals(
  base: IntervalMinutes[],
  blocks: IntervalMinutes[],
): IntervalMinutes[] {
  let result = normalizeIntervals(base);
  const normalizedBlocks = normalizeIntervals(blocks);

  for (const block of normalizedBlocks) {
    const nextResult: IntervalMinutes[] = [];

    for (const interval of result) {
      if (block.end <= interval.start || block.start >= interval.end) {
        nextResult.push(interval);
        continue;
      }

      if (block.start <= interval.start && block.end >= interval.end) continue;

      if (block.start <= interval.start && block.end < interval.end) {
        nextResult.push({ start: block.end, end: interval.end });
        continue;
      }

      if (block.start > interval.start && block.end >= interval.end) {
        nextResult.push({ start: interval.start, end: block.start });
        continue;
      }

      if (block.start > interval.start && block.end < interval.end) {
        nextResult.push(
          { start: interval.start, end: block.start },
          { start: block.end, end: interval.end },
        );
        continue;
      }
    }

    result = nextResult;
  }

  return result;
}

export async function createDailyException(input: DailyExceptionInput) {
  const { barber, unitId, companyId } = await getCurrentBarberContextOrThrow();
  const parsed = dailyExceptionSchema.parse(input);

  if (parsed.barberId && parsed.barberId !== barber.id) {
    throw new Error("Ação não permitida para outro profissional.");
  }

  const date = new Date(parsed.dateISO);
  if (Number.isNaN(date.getTime()))
    return { error: "Data inválida para exceção diária" };

  const dayStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const nextDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
  );
  const weekday = date.getDay();

  const existingDaily = await prisma.barberDailyAvailability.findFirst({
    where: {
      companyId,
      barberId: barber.id,
      unitId,
      date: { gte: dayStart, lt: nextDay },
    },
    include: { intervals: true },
  });

  const isFullDay =
    parsed.mode === "FULL_DAY" ||
    !parsed.intervals ||
    parsed.intervals.length === 0;

  if (isFullDay) {
    if (existingDaily) {
      await prisma.barberDailyTimeInterval.deleteMany({
        where: { dailyAvailabilityId: existingDaily.id },
      });

      await prisma.barberDailyAvailability.update({
        where: { id: existingDaily.id },
        data: { type: "DAY_OFF" },
      });
    } else {
      await prisma.barberDailyAvailability.create({
        data: {
          companyId,
          barberId: barber.id,
          unitId,
          date: dayStart,
          type: "DAY_OFF",
        },
      });
    }

    revalidatePath("/barber/availability");
    revalidatePath("/painel/availability");
    return { success: true };
  }

  const weekly = await prisma.barberWeeklyAvailability.findFirst({
    where: {
      companyId,
      barberId: barber.id,
      unitId,
      weekday,
      isActive: true,
    },
    include: { intervals: true },
  });

  const weeklyIntervals = (weekly?.intervals ?? []).map((i) => ({
    start: timeStringToMinutes(i.startTime),
    end: timeStringToMinutes(i.endTime),
  }));

  if (weeklyIntervals.length === 0) {
    if (existingDaily) {
      await prisma.barberDailyTimeInterval.deleteMany({
        where: { dailyAvailabilityId: existingDaily.id },
      });

      await prisma.barberDailyAvailability.update({
        where: { id: existingDaily.id },
        data: { type: "DAY_OFF" },
      });
    } else {
      await prisma.barberDailyAvailability.create({
        data: {
          companyId,
          barberId: barber.id,
          unitId,
          date: dayStart,
          type: "DAY_OFF",
        },
      });
    }

    revalidatePath("/barber/availability");
    revalidatePath("/painel/availability");
    return { success: true };
  }

  const blockIntervals: IntervalMinutes[] = (parsed.intervals ?? []).map(
    (i) => ({
      start: timeStringToMinutes(i.startTime),
      end: timeStringToMinutes(i.endTime),
    }),
  );

  const remaining = subtractIntervals(weeklyIntervals, blockIntervals);

  if (remaining.length === 0) {
    if (existingDaily) {
      await prisma.barberDailyTimeInterval.deleteMany({
        where: { dailyAvailabilityId: existingDaily.id },
      });

      await prisma.barberDailyAvailability.update({
        where: { id: existingDaily.id },
        data: { type: "DAY_OFF" },
      });
    } else {
      await prisma.barberDailyAvailability.create({
        data: {
          companyId,
          barberId: barber.id,
          unitId,
          date: dayStart,
          type: "DAY_OFF",
        },
      });
    }

    revalidatePath("/barber/availability");
    revalidatePath("/painel/availability");
    return { success: true };
  }

  if (existingDaily) {
    await prisma.barberDailyTimeInterval.deleteMany({
      where: { dailyAvailabilityId: existingDaily.id },
    });

    await prisma.barberDailyAvailability.update({
      where: { id: existingDaily.id },
      data: { type: "CUSTOM" },
    });

    await prisma.barberDailyTimeInterval.createMany({
      data: remaining.map((r) => ({
        dailyAvailabilityId: existingDaily.id,
        startTime: minutesToTimeString(r.start),
        endTime: minutesToTimeString(r.end),
      })),
    });
  } else {
    const createdDaily = await prisma.barberDailyAvailability.create({
      data: {
        companyId,
        barberId: barber.id,
        unitId,
        date: dayStart,
        type: "CUSTOM",
      },
    });

    await prisma.barberDailyTimeInterval.createMany({
      data: remaining.map((r) => ({
        dailyAvailabilityId: createdDaily.id,
        startTime: minutesToTimeString(r.start),
        endTime: minutesToTimeString(r.end),
      })),
    });
  }

  revalidatePath("/barber/availability");
  revalidatePath("/painel/availability");
  return { success: true };
}

export async function deleteDailyException(barberId: string, dateISO: string) {
  const { barber, unitId, companyId } = await getCurrentBarberContextOrThrow();

  if (barberId !== barber.id) {
    throw new Error("Ação não permitida para outro profissional.");
  }

  const date = new Date(dateISO);
  if (Number.isNaN(date.getTime())) return { error: "Data inválida" };

  const dayStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const nextDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
  );

  const existingDaily = await prisma.barberDailyAvailability.findFirst({
    where: {
      companyId,
      barberId: barber.id,
      unitId,
      date: { gte: dayStart, lt: nextDay },
    },
  });

  if (!existingDaily) return { success: true };

  await prisma.barberDailyAvailability.delete({
    where: { id: existingDaily.id },
  });

  revalidatePath("/barber/availability");
  revalidatePath("/painel/availability");
  return { success: true };
}
