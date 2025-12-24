"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CustomerLevel, CustomerLevelRuleType } from "@prisma/client";

// ======================
// Helpers
// ======================

async function getUnitIdFromFormOrDefault(formData: FormData): Promise<string> {
  const raw = formData.get("unitId");
  const fromForm = String(raw ?? "").trim();
  if (fromForm) return fromForm;

  const unit =
    (await prisma.unit.findFirst({
      where: { isActive: true },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    })) ??
    (await prisma.unit.findFirst({
      select: { id: true },
      orderBy: { createdAt: "asc" },
    }));

  if (!unit) {
    throw new Error("Nenhuma unidade encontrada. Crie uma unidade antes.");
  }

  return unit.id;
}

function parseNonNegativeInt(value: unknown, fallback = 0): number {
  const n = Number(String(value ?? "").trim());
  if (!Number.isFinite(n)) return fallback;
  if (!Number.isInteger(n)) return fallback;
  return Math.max(0, n);
}

function parseBoolFromForm(formData: FormData, key: string): boolean {
  const v = formData.get(key);
  if (v === null || v === undefined) return false;
  const s = String(v).toLowerCase();
  return s === "true" || s === "1" || s === "on" || s === "yes";
}

// ======================
// Schemas
// ======================

const customerLevelSchema = z.enum(["BRONZE", "PRATA", "OURO", "DIAMANTE"]);
const ruleTypeSchema = z.enum(["HAS_ACTIVE_PLAN"]);

const configRowSchema = z.object({
  level: customerLevelSchema,
  minAppointmentsDone: z.coerce.number().int().min(0),
  minOrdersCompleted: z.coerce.number().int().min(0),
});

const upsertConfigsSchema = z.object({
  unitId: z.string().min(1),
  rows: z.array(configRowSchema).min(1),
});

const createRuleSchema = z.object({
  unitId: z.string().min(1),
  type: ruleTypeSchema,
  targetLevel: customerLevelSchema,
  priority: z.coerce.number().int().min(0).max(100000).default(100),
  isEnabled: z.coerce.boolean().default(true),
});

const updateRuleSchema = z.object({
  unitId: z.string().min(1),
  ruleId: z.string().min(1),
  type: ruleTypeSchema,
  targetLevel: customerLevelSchema,
  priority: z.coerce.number().int().min(0).max(100000).default(100),
  isEnabled: z.coerce.boolean().default(true),
});

// ======================
// Queries (prefill UI)
// ======================

export async function getCustomerLevelData(unitId?: string | null) {
  const where = unitId ? { unitId } : undefined;

  const [units, configs, rules] = await Promise.all([
    prisma.unit.findMany({
      where: unitId ? { id: unitId } : {},
      orderBy: { name: "asc" },
      select: { id: true, name: true, isActive: true },
    }),
    prisma.customerLevelConfig.findMany({
      where: where ?? {},
      orderBy: [{ unitId: "asc" }, { level: "asc" }],
    }),
    prisma.customerLevelRule.findMany({
      where: where ?? {},
      orderBy: [{ unitId: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
    }),
  ]);

  return { units, configs, rules };
}

// ======================
// CustomerLevelConfig
// ======================

/**
 * Upsert das configs para os 4 níveis.
 * A UI pode mandar 4 linhas; se mandar menos, o que vier é atualizado/criado.
 */
export async function upsertCustomerLevelConfigs(formData: FormData) {
  const unitId = await getUnitIdFromFormOrDefault(formData);

  // lê 4 níveis do form. Aceita nomes flexíveis:
  // minAppointmentsDone_BRONZE, minOrdersCompleted_BRONZE, etc.
  const levels: CustomerLevel[] = ["BRONZE", "PRATA", "OURO", "DIAMANTE"];

  const rows = levels.map((lvl) => {
    const a = formData.get(`minAppointmentsDone_${lvl}`);
    const o = formData.get(`minOrdersCompleted_${lvl}`);

    return {
      level: lvl,
      minAppointmentsDone: parseNonNegativeInt(a, 0),
      minOrdersCompleted: parseNonNegativeInt(o, 0),
    };
  });

  const parsed = upsertConfigsSchema.safeParse({
    unitId,
    rows,
  });

  if (!parsed.success) {
    console.error(parsed.error.flatten());
    throw new Error(
      parsed.error.issues[0]?.message ?? "Configurações inválidas",
    );
  }

  await prisma.$transaction(
    parsed.data.rows.map((r) =>
      prisma.customerLevelConfig.upsert({
        where: { unitId_level: { unitId: parsed.data.unitId, level: r.level } },
        create: {
          unitId: parsed.data.unitId,
          level: r.level,
          minAppointmentsDone: r.minAppointmentsDone,
          minOrdersCompleted: r.minOrdersCompleted,
        },
        update: {
          minAppointmentsDone: r.minAppointmentsDone,
          minOrdersCompleted: r.minOrdersCompleted,
        },
      }),
    ),
  );

  revalidatePath("/admin/client-levels");
}

/**
 * action direta pra form
 */
export async function upsertCustomerLevelConfigsAction(formData: FormData) {
  "use server";
  await upsertCustomerLevelConfigs(formData);

  // volta para a listagem
  redirect("/admin/client-levels");
}

// ======================
// CustomerLevelRule
// ======================

export async function createCustomerLevelRule(formData: FormData) {
  const unitId = await getUnitIdFromFormOrDefault(formData);

  const parsed = createRuleSchema.safeParse({
    unitId,
    type: formData.get("type"),
    targetLevel: formData.get("targetLevel"),
    priority: formData.get("priority"),
    isEnabled: parseBoolFromForm(formData, "isEnabled"),
  });

  if (!parsed.success) {
    console.error(parsed.error.flatten());
    throw new Error(parsed.error.issues[0]?.message ?? "Regra inválida");
  }

  await prisma.customerLevelRule.create({
    data: {
      unitId: parsed.data.unitId,
      type: parsed.data.type as CustomerLevelRuleType,
      targetLevel: parsed.data.targetLevel as CustomerLevel,
      priority: parsed.data.priority,
      isEnabled: parsed.data.isEnabled,
    },
  });

  revalidatePath("/admin/client-levels");
}

export async function createCustomerLevelRuleAction(formData: FormData) {
  "use server";
  await createCustomerLevelRule(formData);
  redirect("/admin/client-levels");
}

export async function updateCustomerLevelRule(formData: FormData) {
  const unitId = await getUnitIdFromFormOrDefault(formData);

  const parsed = updateRuleSchema.safeParse({
    unitId,
    ruleId: formData.get("ruleId"),
    type: formData.get("type"),
    targetLevel: formData.get("targetLevel"),
    priority: formData.get("priority"),
    isEnabled: parseBoolFromForm(formData, "isEnabled"),
  });

  if (!parsed.success) {
    console.error(parsed.error.flatten());
    throw new Error(parsed.error.issues[0]?.message ?? "Regra inválida");
  }

  await prisma.customerLevelRule.update({
    where: { id: parsed.data.ruleId },
    data: {
      // unitId não muda
      type: parsed.data.type as CustomerLevelRuleType,
      targetLevel: parsed.data.targetLevel as CustomerLevel,
      priority: parsed.data.priority,
      isEnabled: parsed.data.isEnabled,
    },
  });

  revalidatePath("/admin/client-levels");
}

export async function updateCustomerLevelRuleAction(formData: FormData) {
  "use server";
  await updateCustomerLevelRule(formData);
  redirect("/admin/client-levels");
}

export async function toggleCustomerLevelRule(ruleId: string) {
  const rule = await prisma.customerLevelRule.findUnique({
    where: { id: ruleId },
    select: { isEnabled: true },
  });

  if (!rule) throw new Error("Regra não encontrada");

  await prisma.customerLevelRule.update({
    where: { id: ruleId },
    data: { isEnabled: !rule.isEnabled },
  });

  revalidatePath("/admin/client-levels");
}

export async function toggleCustomerLevelRuleAction(
  ruleId: string,
  _formData: FormData,
) {
  "use server";
  await toggleCustomerLevelRule(ruleId);
  // sem redirect: só revalida
}

export async function deleteCustomerLevelRule(ruleId: string) {
  await prisma.customerLevelRule.delete({ where: { id: ruleId } });
  revalidatePath("/admin/client-levels");
}

export async function deleteCustomerLevelRuleAction(
  ruleId: string,
  _formData: FormData,
) {
  "use server";
  await deleteCustomerLevelRule(ruleId);
  // sem redirect: só revalida
}
