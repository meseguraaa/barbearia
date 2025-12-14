// app/admin/settings/units/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";

/* ===========================
 * HELPERS
 * =========================== */

function normalizeOptionalText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function isValidTimeHHMM(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

/* ===========================
 * CREATE UNIT
 * =========================== */

const createUnitSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  phone: z.string().optional(),
  address: z.string().optional(),
});

export async function createUnit(formData: FormData): Promise<void> {
  const result = createUnitSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") || undefined,
    address: formData.get("address") || undefined,
  });

  if (!result.success) {
    console.error("[createUnit] Erro de validação:", result.error.flatten());
    return;
  }

  const parsed = result.data;

  const phone = normalizeOptionalText(parsed.phone);
  const address = normalizeOptionalText(parsed.address);

  try {
    await prisma.unit.create({
      data: {
        name: parsed.name.trim(),
        phone,
        address,
        isActive: true,
      },
      select: { id: true },
    });

    revalidatePath("/admin/settings");
    revalidatePath("/admin/settings/units");
    redirect("/admin/settings");
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      console.warn("[createUnit] Conflito de unique (inesperado):", err.meta);
      return;
    }

    console.error("[createUnit] Erro inesperado:", err);
    return;
  }
}

/* ===========================
 * UPDATE UNIT ✅ (FormData)
 * =========================== */

const updateUnitSchema = z.object({
  unitId: z.string().min(1, "unitId obrigatório"),
  name: z.string().min(1, "Nome obrigatório"),
  phone: z.string().optional(),
  address: z.string().optional(),
  // vem do form como string ("on"/"true"/"false") ou pode nem vir
  isActive: z.union([z.boolean(), z.string()]).optional(),
});

function parseIsActive(raw: unknown): boolean | undefined {
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return undefined;

  const v = raw.trim().toLowerCase();
  if (v === "on" || v === "true" || v === "1") return true;
  if (v === "off" || v === "false" || v === "0") return false;

  return undefined;
}

/**
 * ✅ igual createUnit: recebe FormData
 * - pode ser usado em <form action={updateUnit}>
 * - ou chamado manualmente com new FormData()
 */
export async function updateUnit(formData: FormData): Promise<void> {
  const result = updateUnitSchema.safeParse({
    unitId: formData.get("unitId"),
    name: formData.get("name"),
    phone: formData.get("phone") || undefined,
    address: formData.get("address") || undefined,
    isActive: formData.get("isActive") ?? undefined,
  });

  if (!result.success) {
    console.error("[updateUnit] Erro de validação:", result.error.flatten());
    return;
  }

  const parsed = result.data;

  const phone = normalizeOptionalText(parsed.phone);
  const address = normalizeOptionalText(parsed.address);
  const isActive = parseIsActive(parsed.isActive);

  try {
    const unit = await prisma.unit.findUnique({
      where: { id: parsed.unitId },
      select: { id: true },
    });

    if (!unit) {
      console.error("[updateUnit] Unidade não encontrada:", parsed.unitId);
      return;
    }

    await prisma.unit.update({
      where: { id: parsed.unitId },
      data: {
        name: parsed.name.trim(),
        phone,
        address,
        ...(typeof isActive === "boolean" ? { isActive } : {}),
      },
      select: { id: true },
    });

    revalidatePath("/admin/settings");
    revalidatePath("/admin/settings/units");
    revalidatePath(`/admin/settings/units/${parsed.unitId}`);

    redirect("/admin/settings");
  } catch (err) {
    console.error("[updateUnit] Erro inesperado:", err);
    return;
  }
}

/* ===========================
 * TOGGLE UNIT STATUS ✅ (isActive)
 * =========================== */

const toggleUnitStatusSchema = z.object({
  unitId: z.string().min(1, "unitId obrigatório"),
});

export async function toggleUnitStatus(input: { unitId: string }) {
  const parsed = toggleUnitStatusSchema.parse(input);

  const unit = await prisma.unit.findUnique({
    where: { id: parsed.unitId },
    select: { id: true, isActive: true },
  });

  if (!unit) throw new Error("Unidade não encontrada.");

  await prisma.unit.update({
    where: { id: parsed.unitId },
    data: { isActive: !unit.isActive },
    select: { id: true },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/units");
  revalidatePath(`/admin/settings/units/${parsed.unitId}`);

  return { success: true };
}

/* ===========================
 * WEEKLY AVAILABILITY (UNIT)
 * =========================== */

export type UnitWeeklyDayInput = {
  weekday: number; // 0..6
  active: boolean;
  startTime: string; // "" ou "09:00"
  endTime: string; // "" ou "18:00"
};

export type SaveUnitWeeklyAvailabilityInput = {
  unitId: string;
  days: UnitWeeklyDayInput[];
};

const saveUnitWeeklyAvailabilitySchema = z.object({
  unitId: z.string().min(1),
  days: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        active: z.boolean(),
        startTime: z.string().optional().default(""),
        endTime: z.string().optional().default(""),
      }),
    )
    .min(1),
});

export async function saveUnitWeeklyAvailability(
  input: SaveUnitWeeklyAvailabilityInput,
) {
  const parsed = saveUnitWeeklyAvailabilitySchema.parse(input);

  const unit = await prisma.unit.findUnique({
    where: { id: parsed.unitId },
    select: { id: true },
  });

  if (!unit) {
    throw new Error("Unidade não encontrada.");
  }

  const sanitizedDays = parsed.days
    .filter((d) => d.weekday >= 0 && d.weekday <= 6)
    .map((d) => {
      const startTime = String(d.startTime ?? "").trim();
      const endTime = String(d.endTime ?? "").trim();

      return {
        weekday: d.weekday,
        active: !!d.active,
        startTime,
        endTime,
      };
    });

  for (const day of sanitizedDays) {
    if (!day.active) continue;

    if (!day.startTime || !day.endTime) {
      throw new Error(
        `Preencha início e fim no dia ${day.weekday} antes de salvar.`,
      );
    }

    if (!isValidTimeHHMM(day.startTime) || !isValidTimeHHMM(day.endTime)) {
      throw new Error(
        `Horário inválido no dia ${day.weekday}. Use o formato HH:MM.`,
      );
    }

    if (day.startTime >= day.endTime) {
      throw new Error(
        `Horário inválido no dia ${day.weekday}: início deve ser menor que o fim.`,
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const day of sanitizedDays) {
      const weekly = await tx.unitWeeklyAvailability.upsert({
        where: {
          unitId_weekday: { unitId: parsed.unitId, weekday: day.weekday },
        },
        update: { isActive: day.active },
        create: {
          unitId: parsed.unitId,
          weekday: day.weekday,
          isActive: day.active,
        },
        select: { id: true },
      });

      await tx.unitWeeklyTimeInterval.deleteMany({
        where: { weeklyAvailabilityId: weekly.id },
      });

      if (!day.active) continue;

      await tx.unitWeeklyTimeInterval.create({
        data: {
          weeklyAvailabilityId: weekly.id,
          startTime: day.startTime,
          endTime: day.endTime,
        },
      });
    }
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/units");
  revalidatePath(`/admin/settings/units/${parsed.unitId}`);

  return { success: true };
}
