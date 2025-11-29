"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import z from "zod";

const SESSION_COOKIE_NAME = "painel_session";

type PainelSessionPayload = {
  sub: string;
  role: "CLIENT" | "BARBER" | "ADMIN";
  email: string;
  name?: string | null;
};

function getJwtSecretKey() {
  const secret = process.env.PAINEL_JWT_SECRET;
  if (!secret) {
    throw new Error("PAINEL_JWT_SECRET não definido no .env");
  }
  return new TextEncoder().encode(secret);
}

async function getCurrentBarberOrThrow() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    redirect("/painel/login");
  }

  let payload: PainelSessionPayload | null = null;

  try {
    const { payload: raw } = await jwtVerify(token, getJwtSecretKey());
    payload = raw as PainelSessionPayload;
  } catch {
    redirect("/painel/login");
  }

  if (!payload || payload.role !== "BARBER") {
    redirect("/painel/login");
  }

  const barber = await prisma.barber.findUnique({
    where: { email: payload.email },
  });

  if (!barber) {
    throw new Error("Barber não encontrado para o usuário logado.");
  }

  return { barber, session: payload };
}

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

// ===== Action principal: salvar padrão semanal =====

export async function saveWeeklyAvailability(
  input: SaveWeeklyAvailabilityInput,
) {
  const { barber } = await getCurrentBarberOrThrow();

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
    where: { barberId: barber.id },
  });

  const existingByWeekday = new Map<number, (typeof existing)[number]>();
  for (const item of existing) {
    existingByWeekday.set(item.weekday, item);
  }

  for (const day of sanitizedDays) {
    const existingForDay = existingByWeekday.get(day.weekday);

    // 👉 DIA INATIVO: mantém/cria registro com isActive = false e sem intervalos
    if (!day.active) {
      if (existingForDay) {
        // zera intervals e marca como inativo
        await prisma.barberWeeklyTimeInterval.deleteMany({
          where: {
            weeklyAvailabilityId: existingForDay.id,
          },
        });

        await prisma.barberWeeklyAvailability.update({
          where: { id: existingForDay.id },
          data: {
            isActive: false,
          },
        });
      } else {
        // cria um registro só pra marcar o dia como inativo
        await prisma.barberWeeklyAvailability.create({
          data: {
            barberId: barber.id,
            weekday: day.weekday,
            isActive: false,
          },
        });
      }

      continue;
    }

    // 👉 DIA ATIVO: cria/atualiza + 1 intervalo
    let weeklyAvailabilityId = existingForDay?.id;

    if (existingForDay) {
      await prisma.barberWeeklyAvailability.update({
        where: { id: existingForDay.id },
        data: {
          isActive: true,
        },
      });

      await prisma.barberWeeklyTimeInterval.deleteMany({
        where: {
          weeklyAvailabilityId: existingForDay.id,
        },
      });
    } else {
      const created = await prisma.barberWeeklyAvailability.create({
        data: {
          barberId: barber.id,
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

  return { success: true };
}

/* =========================================================
 * EXCEÇÕES DIÁRIAS (IN-DI-SPONIBILIDADE)
 * =======================================================*/

const dailyExceptionSchema = z.object({
  barberId: z.string().min(1),
  dateISO: z.string().min(1), // new Date(dateISO)
  mode: z.enum(["FULL_DAY", "PARTIAL"]),
  // intervalos INDISPONÍVEIS (o que o barbeiro bloqueia)
  intervals: z
    .array(
      z.object({
        startTime: z.string(), // "HH:mm"
        endTime: z.string(), // "HH:mm"
      }),
    )
    .optional(),
});

export type DailyExceptionInput = z.infer<typeof dailyExceptionSchema>;

/* ---------------------------------------------------------
 * Helpers de horário (string <-> minutos)
 * ---------------------------------------------------------*/

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

    if (next.start <= current.end) {
      // sobreposição ou colado → junta
      current.end = Math.max(current.end, next.end);
    } else {
      result.push(current);
      current = { ...next };
    }
  }

  result.push(current);
  return result;
}

/**
 * Subtrai blocos de indisponibilidade dos intervalos base de disponibilidade.
 *
 * base    = disponibilidade semanal (em minutos)
 * blocks  = intervalos INDISPONÍVEIS (o que o barbeiro bloqueou)
 *
 * Retorna nova lista de intervalos de disponibilidade.
 */
function subtractIntervals(
  base: IntervalMinutes[],
  blocks: IntervalMinutes[],
): IntervalMinutes[] {
  let result = normalizeIntervals(base);
  const normalizedBlocks = normalizeIntervals(blocks);

  for (const block of normalizedBlocks) {
    const nextResult: IntervalMinutes[] = [];

    for (const interval of result) {
      // sem sobreposição
      if (block.end <= interval.start || block.start >= interval.end) {
        nextResult.push(interval);
        continue;
      }

      // block cobre o intervalo todo → some
      if (block.start <= interval.start && block.end >= interval.end) {
        continue;
      }

      // corta no começo
      if (block.start <= interval.start && block.end < interval.end) {
        nextResult.push({
          start: block.end,
          end: interval.end,
        });
        continue;
      }

      // corta no final
      if (block.start > interval.start && block.end >= interval.end) {
        nextResult.push({
          start: interval.start,
          end: block.start,
        });
        continue;
      }

      // block está no meio → vira dois
      if (block.start > interval.start && block.end < interval.end) {
        nextResult.push(
          {
            start: interval.start,
            end: block.start,
          },
          {
            start: block.end,
            end: interval.end,
          },
        );
        continue;
      }
    }

    result = nextResult;
  }

  return result;
}

/* ---------------------------------------------------------
 * Criar / atualizar exceção diária
 * (pensando em INDISPONÍVEL, salvando DISPONÍVEL)
 * ---------------------------------------------------------*/

export async function createDailyException(input: DailyExceptionInput) {
  const parsed = dailyExceptionSchema.parse(input);
  const { barberId, dateISO, mode } = parsed;

  const date = new Date(dateISO);
  if (Number.isNaN(date.getTime())) {
    return { error: "Data inválida para exceção diária" };
  }

  // sempre zerando pra início do dia
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
  const weekday = date.getDay(); // 0..6

  // procura se já existe alguma dailyAvailability pra esse dia
  const existingDaily = await prisma.barberDailyAvailability.findFirst({
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

  // FULL_DAY ou sem intervals → vira DAY_OFF direto
  if (
    mode === "FULL_DAY" ||
    !parsed.intervals ||
    parsed.intervals.length === 0
  ) {
    if (existingDaily) {
      // apaga intervalos antigos e marca como DAY_OFF
      await prisma.barberDailyTimeInterval.deleteMany({
        where: { dailyAvailabilityId: existingDaily.id },
      });

      await prisma.barberDailyAvailability.update({
        where: { id: existingDaily.id },
        data: {
          type: "DAY_OFF",
        },
      });
    } else {
      await prisma.barberDailyAvailability.create({
        data: {
          barberId,
          date: dayStart,
          type: "DAY_OFF",
        },
      });
    }

    revalidatePath("/barber/availability");
    return { success: true };
  }

  // PARTIAL → precisamos pegar o padrão semanal e subtrair os blocos
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

  const weeklyIntervals = (weekly?.intervals ?? []).map((i) => ({
    start: timeStringToMinutes(i.startTime),
    end: timeStringToMinutes(i.endTime),
  }));

  // se não tem nada no semanal, na prática é como se fosse dia off
  if (weeklyIntervals.length === 0) {
    if (existingDaily) {
      await prisma.barberDailyTimeInterval.deleteMany({
        where: { dailyAvailabilityId: existingDaily.id },
      });

      await prisma.barberDailyAvailability.update({
        where: { id: existingDaily.id },
        data: {
          type: "DAY_OFF",
        },
      });
    } else {
      await prisma.barberDailyAvailability.create({
        data: {
          barberId,
          date: dayStart,
          type: "DAY_OFF",
        },
      });
    }

    revalidatePath("/barber/availability");
    return { success: true };
  }

  // converte os intervalos INDISPONÍVEIS em minutos
  const blockIntervals: IntervalMinutes[] = (parsed.intervals ?? []).map(
    (i) => ({
      start: timeStringToMinutes(i.startTime),
      end: timeStringToMinutes(i.endTime),
    }),
  );

  const remaining = subtractIntervals(weeklyIntervals, blockIntervals);

  // se não sobrou nada → DAY_OFF
  if (remaining.length === 0) {
    if (existingDaily) {
      await prisma.barberDailyTimeInterval.deleteMany({
        where: { dailyAvailabilityId: existingDaily.id },
      });

      await prisma.barberDailyAvailability.update({
        where: { id: existingDaily.id },
        data: {
          type: "DAY_OFF",
        },
      });
    } else {
      await prisma.barberDailyAvailability.create({
        data: {
          barberId,
          date: dayStart,
          type: "DAY_OFF",
        },
      });
    }

    revalidatePath("/barber/availability");
    return { success: true };
  }

  // se sobrou alguma coisa → CUSTOM com os intervalos restantes
  if (existingDaily) {
    // limpa intervals anteriores
    await prisma.barberDailyTimeInterval.deleteMany({
      where: { dailyAvailabilityId: existingDaily.id },
    });

    await prisma.barberDailyAvailability.update({
      where: { id: existingDaily.id },
      data: {
        type: "CUSTOM",
      },
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
        barberId,
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
  return { success: true };
}

/* ---------------------------------------------------------
 * Remover exceção (volta a seguir apenas o padrão semanal)
 * ---------------------------------------------------------*/
export async function deleteDailyException(barberId: string, dateISO: string) {
  const date = new Date(dateISO);
  if (Number.isNaN(date.getTime())) {
    return { error: "Data inválida" };
  }

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
      barberId,
      date: {
        gte: dayStart,
        lt: nextDay,
      },
    },
  });

  if (!existingDaily) {
    return { success: true }; // nada pra remover, mas tudo bem
  }

  await prisma.barberDailyAvailability.delete({
    where: { id: existingDaily.id },
  });

  revalidatePath("/barber/availability");
  return { success: true };
}
