// src/app/admin/products/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma, CustomerLevel } from "@prisma/client";
import { requireAdminPermission } from "@/lib/admin-permissions";

// ===== Schemas =====

// aceita tanto data URL (base64) quanto URL http(s)
const imageStringSchema = z
  .string()
  .min(1, "A foto é obrigatória")
  .refine(
    (val) =>
      val.startsWith("data:image/") ||
      val.startsWith("http://") ||
      val.startsWith("https://"),
    "Formato de imagem inválido",
  );

function normalizePriceToDecimalString(raw: string): string {
  if (!raw) return "0";

  const onlyDigitsAndSeparators = raw.replace(/[^\d,\.]/g, "");

  if (
    onlyDigitsAndSeparators.includes(",") &&
    onlyDigitsAndSeparators.includes(".")
  ) {
    const withoutThousands = onlyDigitsAndSeparators.replace(/\./g, "");
    return withoutThousands.replace(",", ".");
  }

  if (onlyDigitsAndSeparators.includes(",")) {
    return onlyDigitsAndSeparators.replace(",", ".");
  }

  return onlyDigitsAndSeparators;
}

function parseBoolFromForm(formData: FormData, key: string): boolean {
  const v = formData.get(key);
  if (v === null || v === undefined) return false;
  const s = String(v).toLowerCase();
  return s === "true" || s === "1" || s === "on" || s === "yes";
}

/**
 * ✅ B) campo vazio = 0%
 * - aceita "10", "10%", "10,5" (arredonda pra baixo)
 * - vazio/null/undefined => 0
 */
function parseOptionalPctIntFromFormValue(val: unknown): number {
  const s = String(val ?? "").trim();
  if (!s) return 0;

  const clean = s.replace("%", "").trim().replace(",", ".");
  const n = Number(clean);

  if (!Number.isFinite(n)) return 0;

  const floored = Math.floor(n);
  if (floored < 0) return 0;
  if (floored > 100) return 100;
  return floored;
}

const customerLevelSchema = z.enum(["BRONZE", "PRATA", "OURO", "DIAMANTE"]);

// ✅ aceita "", null, undefined e transforma em undefined (não valida enum)
const optionalCustomerLevelSchema = z.preprocess((val) => {
  if (val === null || val === undefined) return undefined;
  const s = String(val).trim();
  if (!s) return undefined;
  return s;
}, customerLevelSchema.optional());

const baseProductSchema = z.object({
  name: z.string().min(3, "Nome obrigatório"),
  imageUrl: imageStringSchema,
  description: z.string().min(3, "Descrição obrigatória"),
  price: z.string().min(1, "Preço obrigatório"),
  barberPercentage: z
    .string()
    .min(1, "Comissão obrigatória")
    .transform((val) => Number(val.replace(",", ".")))
    .refine((val) => !Number.isNaN(val), {
      message: "Comissão inválida",
    })
    .refine((val) => val >= 0 && val <= 100, {
      message: "Comissão deve ser entre 0 e 100",
    }),
  category: z.string().min(1, "Categoria obrigatória"),

  // ⭐ ESTOQUE
  stockQuantity: z
    .string()
    .min(1, "Estoque obrigatório")
    .transform((val) => Number(val))
    .refine((val) => Number.isInteger(val) && val >= 0, {
      message: "Estoque deve ser um número inteiro maior ou igual a 0",
    }),

  // ✅ PRAZO PARA RETIRADA (DIAS)
  pickupDeadlineDays: z
    .string()
    .optional()
    .transform((val) => {
      const n = Number(val);
      return Number.isFinite(n) ? n : 2;
    })
    .refine((val) => Number.isInteger(val) && val >= 1 && val <= 30, {
      message:
        "Prazo para retirada deve ser um número inteiro entre 1 e 30 dias",
    }),

  // ✅ benefício de aniversário
  birthdayBenefitEnabled: z.boolean().optional(),
  // ✅ "" vira undefined e não quebra enum
  birthdayPriceLevel: optionalCustomerLevelSchema,

  // ✅ destaque no app
  isFeatured: z.boolean().optional(),
});

const createProductSchema = baseProductSchema.superRefine((data, ctx) => {
  if (data.birthdayBenefitEnabled) {
    if (!data.birthdayPriceLevel) {
      ctx.addIssue({
        code: "custom",
        path: ["birthdayPriceLevel"],
        message: "Selecione o nível do benefício de aniversário",
      });
    }
  }
});

const updateProductSchema = createProductSchema;

// ===== Multi-tenant helper =====

async function requireCompanyContext() {
  const admin = (await requireAdminPermission("canAccessProducts")) as any;
  const companyId = String(admin?.companyId ?? "").trim();
  if (!companyId) {
    throw new Error("Contexto inválido: companyId ausente (multi-tenant).");
  }
  return { admin, companyId };
}

// ===== Helpers =====

/**
 * Resolve um unitId:
 * - tenta pegar do form (se existir)
 * - senão, pega a primeira unit (prioriza ativa)
 *
 * Mantém compatibilidade enquanto a UI não manda unitId.
 *
 * 🔒 MULTI-TENANT: sempre filtra por companyId
 */
async function getUnitIdFromFormOrDefault(args: {
  formData: FormData;
  companyId: string;
}): Promise<string> {
  const raw = args.formData.get("unitId");
  const fromForm = String(raw ?? "").trim();

  // ✅ se veio do form, já valida aqui
  if (fromForm) {
    const ok = await prisma.unit.findFirst({
      where: { id: fromForm, companyId: args.companyId },
      select: { id: true },
    });
    if (!ok) {
      throw new Error("Unidade inválida: não pertence a esta empresa.");
    }
    return fromForm;
  }

  const unit =
    (await prisma.unit.findFirst({
      where: { companyId: args.companyId, isActive: true },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    })) ??
    (await prisma.unit.findFirst({
      where: { companyId: args.companyId },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    }));

  if (!unit) {
    throw new Error(
      "Nenhuma unidade encontrada para esta empresa. Crie uma unidade antes de cadastrar produtos.",
    );
  }

  return unit.id;
}

/**
 * 🔒 Garante que a unit pertence à companyId.
 * (defesa extra)
 */
async function assertUnitBelongsToCompany(args: {
  unitId: string;
  companyId: string;
}) {
  const ok = await prisma.unit.findFirst({
    where: { id: args.unitId, companyId: args.companyId },
    select: { id: true },
  });

  if (!ok) {
    throw new Error("Unidade inválida: não pertence a esta empresa.");
  }
}

/**
 * 🔒 Garante que o produto pertence à companyId.
 * (no schema, Product tem companyId direto)
 */
async function assertProductBelongsToCompany(args: {
  productId: string;
  companyId: string;
}) {
  const ok = await prisma.product.findFirst({
    where: { id: args.productId, companyId: args.companyId },
    select: { id: true },
  });

  if (!ok) {
    throw new Error("Produto não encontrado para esta empresa.");
  }
}

/**
 * ✅ B) Lê descontos (%) por nível do form.
 * Campo vazio = 0%.
 *
 * IMPORTANTE:
 * - Para permitir "limpar" desconto antigo, retornamos SEMPRE os 4 níveis.
 *   Assim, 0% vira deleteMany no upsert.
 */
function readLevelDiscountsFromForm(
  formData: FormData,
): Partial<Record<CustomerLevel, number>> {
  const getFirst = (keys: string[]) => {
    for (const k of keys) {
      const v = formData.get(k);
      if (v === null || v === undefined) continue;
      return parseOptionalPctIntFromFormValue(v); // vazio => 0
    }
    // se o input não existir no form, tratamos como undefined (não mexe)
    return undefined as unknown as number;
  };

  const bronze = getFirst([
    "discountBronzePct",
    "discountBronze",
    "levelDiscountBronze",
    "discount_BRONZE",
  ]);
  const prata = getFirst([
    "discountPrataPct",
    "discountPrata",
    "levelDiscountPrata",
    "discount_PRATA",
  ]);
  const ouro = getFirst([
    "discountOuroPct",
    "discountOuro",
    "levelDiscountOuro",
    "discount_OURO",
  ]);
  const diamante = getFirst([
    "discountDiamantePct",
    "discountDiamante",
    "levelDiscountDiamante",
    "discount_DIAMANTE",
  ]);

  const out: Partial<Record<CustomerLevel, number>> = {};

  // Se o campo existe no form, ele vira número (0..100)
  // Se o campo não existe, não mexemos (undefined)
  if (bronze !== (undefined as any)) out.BRONZE = bronze;
  if (prata !== (undefined as any)) out.PRATA = prata;
  if (ouro !== (undefined as any)) out.OURO = ouro;
  if (diamante !== (undefined as any)) out.DIAMANTE = diamante;

  return out;
}

/**
 * ✅ Upsert de descontos por nível
 *
 * regra:
 * - pct <= 0 => deleteMany
 * - pct > 0  => upsert
 * - pct undefined => não mexe
 *
 * 🔒 MULTI-TENANT:
 * - ProductDiscountByLevel exige companyId -> sempre setar no create
 */
async function upsertProductDiscountsByLevel(args: {
  productId: string;
  companyId: string;
  discounts: Partial<Record<CustomerLevel, number>>;
}) {
  const levels: CustomerLevel[] = ["BRONZE", "PRATA", "OURO", "DIAMANTE"];

  const ops = levels
    .map((level) => {
      const pct = args.discounts[level];

      if (pct === undefined) return null;

      if (pct <= 0) {
        return prisma.productDiscountByLevel.deleteMany({
          where: {
            productId: args.productId,
            companyId: args.companyId,
            level,
          },
        });
      }

      return prisma.productDiscountByLevel.upsert({
        where: { productId_level: { productId: args.productId, level } },
        create: {
          companyId: args.companyId,
          productId: args.productId,
          level,
          discountPct: pct,
        },
        update: { discountPct: pct },
      });
    })
    .filter(Boolean) as any[];

  if (ops.length === 0) return;

  try {
    await prisma.$transaction(ops);
  } catch (e) {
    console.warn("[upsertProductDiscountsByLevel] skip:", e);
  }
}

// ✅ buscar pricing completo pra preencher modal de edição
export async function getProductPricing(productId: string) {
  "use server";

  const { companyId } = await requireCompanyContext();

  try {
    const p = await prisma.product.findFirst({
      where: { id: productId, companyId },
      select: {
        id: true,
        barberPercentage: true,
        birthdayBenefitEnabled: true,
        birthdayPriceLevel: true,
        isFeatured: true,
        discounts: { select: { level: true, discountPct: true } },
      },
    });

    if (!p) throw new Error("Produto não encontrado");

    const levelDiscounts: Partial<Record<CustomerLevel, number>> = {};
    for (const row of p.discounts ?? []) {
      const pct = Number(row.discountPct);
      if (Number.isFinite(pct)) levelDiscounts[row.level] = pct;
    }

    return {
      productId: p.id,
      barberPercentage:
        p.barberPercentage === null || p.barberPercentage === undefined
          ? null
          : Number(p.barberPercentage),
      birthdayBenefitEnabled: Boolean(p.birthdayBenefitEnabled),
      birthdayPriceLevel: (p.birthdayPriceLevel ??
        null) as CustomerLevel | null,
      isFeatured: Boolean(p.isFeatured ?? false),
      levelDiscounts,
    };
  } catch (e) {
    console.warn("[getProductPricing] fallback:", e);

    const p = await prisma.product.findFirst({
      where: { id: productId, companyId },
      select: {
        id: true,
        barberPercentage: true,
        birthdayBenefitEnabled: true,
        birthdayPriceLevel: true,
      },
    });

    if (!p) throw new Error("Produto não encontrado");

    return {
      productId: p.id,
      barberPercentage:
        p.barberPercentage === null || p.barberPercentage === undefined
          ? null
          : Number(p.barberPercentage),
      birthdayBenefitEnabled: Boolean(p.birthdayBenefitEnabled),
      birthdayPriceLevel: (p.birthdayPriceLevel ??
        null) as CustomerLevel | null,
      isFeatured: false,
      levelDiscounts: {},
    };
  }
}

// ===== Funções base (prisma + revalidate) =====

export async function createProduct(formData: FormData) {
  const { companyId } = await requireCompanyContext();

  const birthdayBenefitEnabled = parseBoolFromForm(
    formData,
    "birthdayBenefitEnabled",
  );
  const isFeatured = parseBoolFromForm(formData, "isFeatured");

  const parsed = createProductSchema.safeParse({
    name: formData.get("name"),
    imageUrl: formData.get("imageUrl"),
    description: formData.get("description"),
    price: formData.get("price"),
    barberPercentage: formData.get("barberPercentage"),
    category: formData.get("category"),
    stockQuantity: formData.get("stockQuantity"),
    pickupDeadlineDays: formData.get("pickupDeadlineDays"),
    birthdayBenefitEnabled,
    birthdayPriceLevel: formData.get("birthdayPriceLevel"),
    isFeatured,
  });

  if (!parsed.success) {
    console.error(parsed.error.flatten());
    throw new Error(
      parsed.error.issues[0]?.message ?? "Dados do produto inválidos",
    );
  }

  const {
    name,
    imageUrl,
    description,
    price,
    barberPercentage,
    category,
    stockQuantity,
    pickupDeadlineDays,
    birthdayPriceLevel,
    isFeatured: isFeaturedParsed,
  } = parsed.data;

  const normalizedPrice = normalizePriceToDecimalString(price);

  const unitId = await getUnitIdFromFormOrDefault({ formData, companyId });
  await assertUnitBelongsToCompany({ unitId, companyId });

  const levelDiscounts = readLevelDiscountsFromForm(formData);

  const baseData = {
    name,
    imageUrl,
    description,
    price: new Prisma.Decimal(normalizedPrice),
    barberPercentage,
    category,
    stockQuantity,
    pickupDeadlineDays,
    birthdayBenefitEnabled,
    birthdayPriceLevel: birthdayBenefitEnabled
      ? (birthdayPriceLevel as CustomerLevel)
      : null,

    // ✅ tenant
    company: { connect: { id: companyId } },
    unit: { connect: { id: unitId } },
  };

  const created = await prisma.product.create({
    data: {
      ...baseData,
      isFeatured: Boolean(isFeaturedParsed),
    } as any,
    select: { id: true },
  });

  await upsertProductDiscountsByLevel({
    productId: created.id,
    companyId,
    discounts: levelDiscounts,
  });

  revalidatePath("/admin/products");
}

export async function updateProduct(productId: string, formData: FormData) {
  const { companyId } = await requireCompanyContext();

  const birthdayBenefitEnabled = parseBoolFromForm(
    formData,
    "birthdayBenefitEnabled",
  );
  const isFeatured = parseBoolFromForm(formData, "isFeatured");

  const parsed = updateProductSchema.safeParse({
    name: formData.get("name"),
    imageUrl: formData.get("imageUrl"),
    description: formData.get("description"),
    price: formData.get("price"),
    barberPercentage: formData.get("barberPercentage"),
    category: formData.get("category"),
    stockQuantity: formData.get("stockQuantity"),
    pickupDeadlineDays: formData.get("pickupDeadlineDays"),
    birthdayBenefitEnabled,
    birthdayPriceLevel: formData.get("birthdayPriceLevel"),
    isFeatured,
  });

  if (!parsed.success) {
    console.error(parsed.error.flatten());
    throw new Error(
      parsed.error.issues[0]?.message ?? "Dados do produto inválidos",
    );
  }

  await assertProductBelongsToCompany({ productId, companyId });

  const {
    name,
    imageUrl,
    description,
    price,
    barberPercentage,
    category,
    stockQuantity,
    pickupDeadlineDays,
    birthdayPriceLevel,
    isFeatured: isFeaturedParsed,
  } = parsed.data;

  const normalizedPrice = normalizePriceToDecimalString(price);
  const levelDiscounts = readLevelDiscountsFromForm(formData);

  const baseData = {
    name,
    imageUrl,
    description,
    price: new Prisma.Decimal(normalizedPrice),
    barberPercentage,
    category,
    stockQuantity,
    pickupDeadlineDays,
    birthdayBenefitEnabled,
    birthdayPriceLevel: birthdayBenefitEnabled
      ? (birthdayPriceLevel as CustomerLevel)
      : null,
  };

  const updated = await prisma.product.updateMany({
    where: { id: productId, companyId },
    data: {
      ...baseData,
      isFeatured: Boolean(isFeaturedParsed),
    } as any,
  });

  if (updated.count === 0) {
    throw new Error("Produto não encontrado para esta empresa.");
  }

  await upsertProductDiscountsByLevel({
    productId,
    companyId,
    discounts: levelDiscounts,
  });

  revalidatePath("/admin/products");
}

export async function toggleProductStatus(productId: string) {
  const { companyId } = await requireCompanyContext();

  const product = await prisma.product.findFirst({
    where: { id: productId, companyId },
    select: { isActive: true },
  });

  if (!product) throw new Error("Produto não encontrado para esta empresa.");

  const updated = await prisma.product.updateMany({
    where: { id: productId, companyId },
    data: { isActive: !product.isActive },
  });

  if (updated.count === 0) {
    throw new Error("Produto não encontrado para esta empresa.");
  }

  revalidatePath("/admin/products");
}

// ✅ toggle do destaque (sem _dmmf)
export async function toggleProductFeatured(productId: string) {
  const { companyId } = await requireCompanyContext();

  const product = await prisma.product.findFirst({
    where: { id: productId, companyId },
    select: { isFeatured: true },
  });

  if (!product) throw new Error("Produto não encontrado para esta empresa.");

  try {
    const updated = await prisma.product.updateMany({
      where: { id: productId, companyId },
      data: { isFeatured: !Boolean(product.isFeatured) } as any,
    });

    if (updated.count === 0) {
      throw new Error("Produto não encontrado para esta empresa.");
    }

    revalidatePath("/admin/products");
  } catch {
    throw new Error(
      "Seu Prisma Client não reconhece isFeatured. Rode migration + prisma generate e reinicie o servidor.",
    );
  }
}

// ===== Actions usadas diretamente nos <form> ou nos componentes client =====

export async function createProductAction(formData: FormData) {
  "use server";
  await createProduct(formData);
  redirect("/admin/products");
}

export async function updateProductAction(
  productId: string,
  formData: FormData,
) {
  "use server";
  await updateProduct(productId, formData);
  redirect("/admin/products");
}

export async function toggleProductStatusAction(
  productId: string,
  _formData: FormData,
) {
  "use server";
  await toggleProductStatus(productId);
}

export async function toggleProductFeaturedAction(
  productId: string,
  _formData: FormData,
) {
  "use server";
  await toggleProductFeatured(productId);
}
