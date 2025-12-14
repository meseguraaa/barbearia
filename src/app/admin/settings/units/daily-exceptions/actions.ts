// app/admin/settings/units/daily-exceptions/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/* ===========================
 * VALIDATORS
 * =========================== */

const timeHHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Use HH:MM (ex: 09:00)");

const createUnitDailyExceptionSchema = z.object({
  unitId: z.string().min(1),
  dateISO: z.string().datetime(),
  mode: z.enum(["FULL_DAY", "PARTIAL"]),
  intervals: z
    .array(
      z.object({
        startTime: timeHHMM,
        endTime: timeHHMM,
      }),
    )
    .default([]),
});

const deleteUnitDailyExceptionSchema = z.object({
  unitId: z.string().min(1),
  dateISO: z.string().datetime(),
});

/* ===========================
 * HELPERS
 * =========================== */

function assertIntervalsValid(
  intervals: Array<{ startTime: string; endTime: string }>,
) {
  for (const it of intervals) {
    if (it.startTime >= it.endTime) {
      throw new Error("Intervalo inválido: início deve ser menor que o fim.");
    }
  }
}

/* ===========================
 * CREATE (UPSERT por dia)
 * =========================== */

export async function createUnitDailyException(
  input: z.infer<typeof createUnitDailyExceptionSchema>,
) {
  const parsed = createUnitDailyExceptionSchema.parse(input);

  const date = new Date(parsed.dateISO);

  // garante que a unidade existe
  const unit = await prisma.unit.findUnique({
    where: { id: parsed.unitId },
    select: { id: true },
  });
  if (!unit) throw new Error("Unidade não encontrada.");

  if (parsed.mode === "PARTIAL") {
    if (parsed.intervals.length === 0) {
      throw new Error("Adicione pelo menos 1 intervalo para exceção parcial.");
    }
    assertIntervalsValid(parsed.intervals);
  }

  await prisma.$transaction(async (tx) => {
    // cria/atualiza o registro do dia (por unique [unitId, date])
    const daily = await tx.unitDailyAvailability.upsert({
      where: {
        unitId_date: {
          unitId: parsed.unitId,
          date,
        },
      },
      update: {
        isClosed: parsed.mode === "FULL_DAY",
      },
      create: {
        unitId: parsed.unitId,
        date,
        isClosed: parsed.mode === "FULL_DAY",
      },
      select: { id: true },
    });

    // sempre reescreve os intervalos (idempotente)
    await tx.unitDailyTimeInterval.deleteMany({
      where: { dailyAvailabilityId: daily.id },
    });

    // FULL_DAY = fechado, sem intervalos
    if (parsed.mode === "FULL_DAY") return;

    // PARTIAL = salva os intervalos
    await tx.unitDailyTimeInterval.createMany({
      data: parsed.intervals.map((i) => ({
        dailyAvailabilityId: daily.id,
        startTime: i.startTime,
        endTime: i.endTime,
      })),
    });
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/units");
  revalidatePath(`/admin/settings/units/${parsed.unitId}`);

  return { success: true };
}

/* ===========================
 * DELETE
 * =========================== */

export async function deleteUnitDailyException(
  input: z.infer<typeof deleteUnitDailyExceptionSchema>,
) {
  const parsed = deleteUnitDailyExceptionSchema.parse(input);

  const date = new Date(parsed.dateISO);

  await prisma.unitDailyAvailability.deleteMany({
    where: {
      unitId: parsed.unitId,
      date,
    },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/units");
  revalidatePath(`/admin/settings/units/${parsed.unitId}`);

  return { success: true };
}
