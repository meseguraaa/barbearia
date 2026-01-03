// app/admin/settings/units/daily-exceptions/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminForModule } from "@/lib/admin-permissions";

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

async function requireUnitFromCompanyOrThrow(
  unitId: string,
  companyId: string,
) {
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, companyId },
    select: { id: true },
  });
  if (!unit) throw new Error("Unidade não encontrada (company mismatch).");
  return unit;
}

/* ===========================
 * CREATE (UPSERT por dia)
 * =========================== */

export async function createUnitDailyException(
  input: z.infer<typeof createUnitDailyExceptionSchema>,
) {
  const admin = await requireAdminForModule("SETTINGS");
  const companyId = admin.companyId;

  const parsed = createUnitDailyExceptionSchema.parse(input);
  const date = new Date(parsed.dateISO);

  await requireUnitFromCompanyOrThrow(parsed.unitId, companyId);

  if (parsed.mode === "PARTIAL") {
    if (parsed.intervals.length === 0) {
      throw new Error("Adicione pelo menos 1 intervalo para exceção parcial.");
    }
    assertIntervalsValid(parsed.intervals);
  }

  await prisma.$transaction(async (tx) => {
    const daily = await tx.unitDailyAvailability.upsert({
      where: {
        unitId_date: {
          unitId: parsed.unitId,
          date,
        },
      },
      update: {
        companyId,
        isClosed: parsed.mode === "FULL_DAY",
      },
      create: {
        companyId,
        unitId: parsed.unitId,
        date,
        isClosed: parsed.mode === "FULL_DAY",
      },
      select: { id: true },
    });

    await tx.unitDailyTimeInterval.deleteMany({
      where: { dailyAvailabilityId: daily.id },
    });

    if (parsed.mode === "FULL_DAY") return;

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
  const admin = await requireAdminForModule("SETTINGS");
  const companyId = admin.companyId;

  const parsed = deleteUnitDailyExceptionSchema.parse(input);
  const date = new Date(parsed.dateISO);

  await requireUnitFromCompanyOrThrow(parsed.unitId, companyId);

  await prisma.unitDailyAvailability.deleteMany({
    where: {
      companyId,
      unitId: parsed.unitId,
      date,
    },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/units");
  revalidatePath(`/admin/settings/units/${parsed.unitId}`);

  return { success: true };
}
