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

// revalida as duas telas envolvidas (painel e edição)
function revalidateClientLevels() {
  revalidatePath("/admin/client-levels");
  revalidatePath("/admin/client-levels/rules");
  revalidatePath("/admin/client-levels/config");
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

// ✅ Agora o admin NÃO controla prioridade nem enabled.
// Regra é sempre criada "ativa" (se você ainda tiver a coluna no banco, vamos setar true)
// e prioridade fica default interna.
const createRuleSchema = z.object({
  unitId: z.string().min(1),
  type: ruleTypeSchema,
  targetLevel: customerLevelSchema,
});

const updateRuleSchema = z.object({
  unitId: z.string().min(1),
  ruleId: z.string().min(1),
  type: ruleTypeSchema,
  targetLevel: customerLevelSchema,
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
      // prioridade ainda existe internamente, então mantém ordenação segura
      orderBy: [{ unitId: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
    }),
  ]);

  return { units, configs, rules };
}

// ======================
// CustomerLevelConfig
// ======================

export async function upsertCustomerLevelConfigs(formData: FormData) {
  const unitId = await getUnitIdFromFormOrDefault(formData);

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

  revalidateClientLevels();
}

export async function upsertCustomerLevelConfigsAction(formData: FormData) {
  "use server";
  const unitId = await getUnitIdFromFormOrDefault(formData);
  await upsertCustomerLevelConfigs(formData);

  redirect(`/admin/client-levels?unitId=${unitId}`);
}

// ======================
// CustomerLevelRule
// ======================

const DEFAULT_RULE_PRIORITY = 100;

export async function createCustomerLevelRule(formData: FormData) {
  const unitId = await getUnitIdFromFormOrDefault(formData);

  const parsed = createRuleSchema.safeParse({
    unitId,
    type: formData.get("type"),
    targetLevel: formData.get("targetLevel"),
  });

  if (!parsed.success) {
    console.error(parsed.error.flatten());
    throw new Error(parsed.error.issues[0]?.message ?? "Regra inválida");
  }

  // Regra de negócio: 1 regra por unidade
  const exists = await prisma.customerLevelRule.findFirst({
    where: { unitId: parsed.data.unitId },
    select: { id: true },
  });

  if (exists) {
    throw new Error("Esta unidade já possui uma regra. Edite a existente.");
  }

  await prisma.customerLevelRule.create({
    data: {
      unitId: parsed.data.unitId,
      type: parsed.data.type as CustomerLevelRuleType,
      targetLevel: parsed.data.targetLevel as CustomerLevel,

      // ✅ internos
      priority: DEFAULT_RULE_PRIORITY,

      // ✅ se sua coluna ainda existe no banco, mantém verdadeiro sempre.
      // Se você remover a coluna do schema futuramente, é só tirar essa linha.
      isEnabled: true,
    },
  });

  revalidateClientLevels();
}

export async function createCustomerLevelRuleAction(formData: FormData) {
  "use server";
  const unitId = await getUnitIdFromFormOrDefault(formData);
  await createCustomerLevelRule(formData);

  // volta sem create=1 pra sumir bloco "Nova regra" e botão "Criar"
  redirect(`/admin/client-levels/rules?unitId=${unitId}`);
}

export async function updateCustomerLevelRule(formData: FormData) {
  const unitId = await getUnitIdFromFormOrDefault(formData);

  const parsed = updateRuleSchema.safeParse({
    unitId,
    ruleId: formData.get("ruleId"),
    type: formData.get("type"),
    targetLevel: formData.get("targetLevel"),
  });

  if (!parsed.success) {
    console.error(parsed.error.flatten());
    throw new Error(parsed.error.issues[0]?.message ?? "Regra inválida");
  }

  await prisma.customerLevelRule.update({
    where: { id: parsed.data.ruleId },
    data: {
      type: parsed.data.type as CustomerLevelRuleType,
      targetLevel: parsed.data.targetLevel as CustomerLevel,

      // ✅ admin não altera isso
      // priority: (mantém como está)
      // isEnabled: (mantém true sempre; sem toggle)
    },
  });

  revalidateClientLevels();
}

export async function updateCustomerLevelRuleAction(formData: FormData) {
  "use server";
  const unitId = await getUnitIdFromFormOrDefault(formData);
  await updateCustomerLevelRule(formData);
  redirect(`/admin/client-levels/rules?unitId=${unitId}`);
}

export async function deleteCustomerLevelRule(ruleId: string) {
  await prisma.customerLevelRule.delete({ where: { id: ruleId } });
  revalidateClientLevels();
}

export async function deleteCustomerLevelRuleAction(
  ruleId: string,
  formData: FormData,
) {
  "use server";
  const unitId = await getUnitIdFromFormOrDefault(formData);
  await deleteCustomerLevelRule(ruleId);
  redirect(`/admin/client-levels/rules?unitId=${unitId}`);
}
