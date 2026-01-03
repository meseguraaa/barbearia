// src/app/admin/client-levels/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { CustomerLevel, CustomerLevelRuleType } from "@prisma/client";

// ✅ Multi-tenant cookie (ajuste se necessário)
const COMPANY_COOKIE_NAME = "admin_company_context";
const COMPANY_COOKIE_FALLBACK = "companyId";

// ✅ sessão do painel (mesmo padrão das telas)
const SESSION_COOKIE_NAME = "painel_session";

type PainelSessionPayload = {
  sub: string;
  role: "CLIENT" | "BARBER" | "ADMIN";
  email: string;
  name?: string | null;
  companyId?: string;
};

function getJwtSecretKey() {
  const secret = process.env.PAINEL_JWT_SECRET;
  if (!secret) {
    throw new Error("PAINEL_JWT_SECRET não definido no .env");
  }
  return new TextEncoder().encode(secret);
}

async function readSessionPayloadOrNull(): Promise<PainelSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    return payload as unknown as PainelSessionPayload;
  } catch {
    return null;
  }
}

// ======================
// Multi-tenant helpers
// ======================
async function requireCompanyId(): Promise<string> {
  const cookieStore = await cookies();

  // 1) ✅ cookie de contexto
  const fromCookie =
    cookieStore.get(COMPANY_COOKIE_NAME)?.value ??
    cookieStore.get(COMPANY_COOKIE_FALLBACK)?.value ??
    "";

  const normalizedCookie = String(fromCookie).trim();
  if (normalizedCookie) return normalizedCookie;

  // 2) ✅ token do painel (se tiver companyId)
  const session = await readSessionPayloadOrNull();
  const fromToken = String(session?.companyId ?? "").trim();
  if (fromToken) return fromToken;

  // 3) ✅ membership fallback
  if (!session?.sub) {
    throw new Error(
      "Contexto de empresa ausente (companyId). Faça login novamente e selecione uma empresa.",
    );
  }

  const memberships = await prisma.companyMember.findMany({
    where: {
      userId: session.sub,
      isActive: true,
      company: { isActive: true },
    },
    select: { companyId: true },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  const uniqueCompanyIds = Array.from(
    new Set(memberships.map((m) => m.companyId).filter(Boolean)),
  );

  if (uniqueCompanyIds.length === 1) {
    return uniqueCompanyIds[0]!;
  }

  throw new Error(
    "Contexto de empresa ausente (companyId). Selecione uma empresa antes de executar esta ação.",
  );
}

async function assertUnitBelongsToCompany(unitId: string, companyId: string) {
  const ok = await prisma.unit.findFirst({
    where: { id: unitId, companyId },
    select: { id: true },
  });
  if (!ok) {
    throw new Error("Unidade inválida para a empresa atual (companyId).");
  }
}

// ======================
// Helpers
// ======================
async function getUnitIdFromFormOrDefault(
  formData: FormData,
  companyId: string,
): Promise<string> {
  const raw = formData.get("unitId");
  const fromForm = String(raw ?? "").trim();
  if (fromForm) {
    await assertUnitBelongsToCompany(fromForm, companyId);
    return fromForm;
  }

  const unit =
    (await prisma.unit.findFirst({
      where: { companyId, isActive: true },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    })) ??
    (await prisma.unit.findFirst({
      where: { companyId },
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
  const companyId = await requireCompanyId();

  const whereUnit = unitId ? { id: unitId, companyId } : { companyId };
  const whereByUnit = unitId ? { unitId, companyId } : { companyId };

  const [units, configs, rules] = await Promise.all([
    prisma.unit.findMany({
      where: whereUnit,
      orderBy: { name: "asc" },
      select: { id: true, name: true, isActive: true },
    }),
    prisma.customerLevelConfig.findMany({
      where: whereByUnit,
      orderBy: [{ unitId: "asc" }, { level: "asc" }],
    }),
    prisma.customerLevelRule.findMany({
      where: whereByUnit,
      orderBy: [{ unitId: "asc" }, { priority: "desc" }, { createdAt: "asc" }],
    }),
  ]);

  return { units, configs, rules };
}

// ======================
// CustomerLevelConfig
// ======================
export async function upsertCustomerLevelConfigs(formData: FormData) {
  const companyId = await requireCompanyId();
  const unitId = await getUnitIdFromFormOrDefault(formData, companyId);

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

  // ✅ garante que a unidade pertence ao tenant antes de qualquer upsert
  await assertUnitBelongsToCompany(parsed.data.unitId, companyId);

  await prisma.$transaction(
    parsed.data.rows.map((r) =>
      prisma.customerLevelConfig.upsert({
        where: { unitId_level: { unitId: parsed.data.unitId, level: r.level } },
        create: {
          companyId,
          unitId: parsed.data.unitId,
          level: r.level,
          minAppointmentsDone: r.minAppointmentsDone,
          minOrdersCompleted: r.minOrdersCompleted,
        },
        update: {
          // invariantes garantidas por:
          // 1) unitId pertence ao companyId
          // 2) create sempre grava companyId
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
  const companyId = await requireCompanyId();
  const unitId = await getUnitIdFromFormOrDefault(formData, companyId);

  await upsertCustomerLevelConfigs(formData);

  // ✅ volta para a própria tela de config (melhor UX)
  redirect(`/admin/client-levels/config?unitId=${unitId}`);
}

// ======================
// CustomerLevelRule
// ======================
const DEFAULT_RULE_PRIORITY = 100;

export async function createCustomerLevelRule(formData: FormData) {
  const companyId = await requireCompanyId();
  const unitId = await getUnitIdFromFormOrDefault(formData, companyId);

  const parsed = createRuleSchema.safeParse({
    unitId,
    type: formData.get("type"),
    targetLevel: formData.get("targetLevel"),
  });

  if (!parsed.success) {
    console.error(parsed.error.flatten());
    throw new Error(parsed.error.issues[0]?.message ?? "Regra inválida");
  }

  await assertUnitBelongsToCompany(parsed.data.unitId, companyId);

  // ✅ 1 regra por unidade, sempre scoping por companyId
  const exists = await prisma.customerLevelRule.findFirst({
    where: { unitId: parsed.data.unitId, companyId },
    select: { id: true },
  });

  if (exists) {
    throw new Error("Esta unidade já possui uma regra. Edite a existente.");
  }

  await prisma.customerLevelRule.create({
    data: {
      companyId,
      unitId: parsed.data.unitId,
      type: parsed.data.type as CustomerLevelRuleType,
      targetLevel: parsed.data.targetLevel as CustomerLevel,
      priority: DEFAULT_RULE_PRIORITY,
      isEnabled: true,
    },
  });

  revalidateClientLevels();
}

export async function createCustomerLevelRuleAction(formData: FormData) {
  "use server";
  const companyId = await requireCompanyId();
  const unitId = await getUnitIdFromFormOrDefault(formData, companyId);

  await createCustomerLevelRule(formData);
  redirect(`/admin/client-levels/rules?unitId=${unitId}`);
}

export async function updateCustomerLevelRule(formData: FormData) {
  const companyId = await requireCompanyId();
  const unitId = await getUnitIdFromFormOrDefault(formData, companyId);

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

  await assertUnitBelongsToCompany(parsed.data.unitId, companyId);

  // ✅ update REAL por tenant (updateMany permite where com companyId)
  const result = await prisma.customerLevelRule.updateMany({
    where: {
      id: parsed.data.ruleId,
      companyId,
      unitId: parsed.data.unitId,
    },
    data: {
      type: parsed.data.type as CustomerLevelRuleType,
      targetLevel: parsed.data.targetLevel as CustomerLevel,
    },
  });

  if (result.count === 0) {
    throw new Error("Regra não encontrada para a empresa atual (companyId).");
  }

  revalidateClientLevels();
}

export async function updateCustomerLevelRuleAction(formData: FormData) {
  "use server";
  const companyId = await requireCompanyId();
  const unitId = await getUnitIdFromFormOrDefault(formData, companyId);

  await updateCustomerLevelRule(formData);
  redirect(`/admin/client-levels/rules?unitId=${unitId}`);
}

export async function deleteCustomerLevelRule(ruleId: string, unitId: string) {
  const companyId = await requireCompanyId();
  await assertUnitBelongsToCompany(unitId, companyId);

  const result = await prisma.customerLevelRule.deleteMany({
    where: { id: ruleId, companyId, unitId },
  });

  if (result.count === 0) {
    throw new Error("Regra não encontrada para a empresa atual (companyId).");
  }

  revalidateClientLevels();
}

export async function deleteCustomerLevelRuleAction(
  ruleId: string,
  formData: FormData,
) {
  "use server";
  const companyId = await requireCompanyId();
  const unitId = await getUnitIdFromFormOrDefault(formData, companyId);

  await deleteCustomerLevelRule(ruleId, unitId);
  redirect(`/admin/client-levels/rules?unitId=${unitId}`);
}
