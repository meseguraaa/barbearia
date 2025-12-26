// src/app/admin/products/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma, CustomerLevel } from "@prisma/client";

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

// ===== Helpers =====

/**
 * Resolve um unitId:
 * - tenta pegar do form (se existir)
 * - senão, pega a primeira unit (prioriza ativa)
 *
 * Mantém compatibilidade enquanto a UI não manda unitId.
 */
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
    throw new Error(
      "Nenhuma unidade encontrada. Crie uma unidade antes de cadastrar produtos.",
    );
  }

  return unit.id;
}

/**
 * ✅ B) Lê descontos (%) por nível do form e SEMPRE retorna os 4 níveis.
 * Campo vazio = 0%.
 *
 * IMPORTANTE:
 * - aqui você escolheu só mandar > 0 (pra input vazio não gerar linha)
 */
function readLevelDiscountsFromForm(
  formData: FormData,
): Partial<Record<CustomerLevel, number>> {
  const getFirst = (keys: string[]) => {
    for (const k of keys) {
      const v = formData.get(k);
      if (v === null || v === undefined) continue;
      const parsed = parseOptionalPctIntFromFormValue(v); // vazio => 0
      return parsed;
    }
    return 0;
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

  // ✅ só inclui no payload se for > 0
  const out: Partial<Record<CustomerLevel, number>> = {};
  if (bronze > 0) out.BRONZE = bronze;
  if (prata > 0) out.PRATA = prata;
  if (ouro > 0) out.OURO = ouro;
  if (diamante > 0) out.DIAMANTE = diamante;

  return out;
}

/**
 * 🔒 Compat: só inclui isFeatured no payload se o Prisma Client reconhecer o campo.
 * (mantive seu comportamento)
 */
function withFeaturedField<T extends Record<string, any>>(
  data: T,
  isFeatured: boolean,
): T {
  const anyPrisma: any = prisma as any;
  const model = anyPrisma?._dmmf?.modelMap?.Product;
  const fields: Array<{ name: string }> = model?.fields ?? [];

  const hasIsFeatured = fields.some((f) => f?.name === "isFeatured");
  if (!hasIsFeatured) return data;

  return { ...data, isFeatured } as T;
}

/**
 * ✅ NOVO (mais robusto):
 * - não depende de _dmmf pra decidir se vai salvar
 * - tenta rodar e, se não existir model/tabela/constraint, só loga e segue
 *
 * regra:
 * - pct <= 0 => apaga (deleteMany)
 * - pct > 0  => upsert
 * - pct undefined => não mexe
 */
async function upsertProductDiscountsByLevel(args: {
  productId: string;
  discounts: Partial<Record<CustomerLevel, number>>;
}) {
  const levels: CustomerLevel[] = ["BRONZE", "PRATA", "OURO", "DIAMANTE"];

  try {
    await prisma.$transaction(
      levels.map((level) => {
        const pct = args.discounts[level];

        // não veio => não mexe nesse nível
        if (pct === undefined) {
          return prisma.$executeRaw`SELECT 1`;
        }

        // veio 0/negativo => apaga registro (deixa "vazio" no edit)
        if (pct <= 0) {
          return (prisma as any).productDiscountByLevel.deleteMany({
            where: { productId: args.productId, level },
          });
        }

        // veio >0 => upsert
        return (prisma as any).productDiscountByLevel.upsert({
          where: { productId_level: { productId: args.productId, level } },
          create: { productId: args.productId, level, discountPct: pct },
          update: { discountPct: pct },
        });
      }),
    );
  } catch (e) {
    console.warn("[upsertProductDiscountsByLevel] skip:", e);
  }
}

// ✅ buscar pricing completo pra preencher modal de edição
export async function getProductPricing(productId: string) {
  "use server";

  // 1) tenta buscar com os campos novos (discounts + isFeatured)
  try {
    const p = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        barberPercentage: true,
        birthdayBenefitEnabled: true,
        birthdayPriceLevel: true,
        isFeatured: true,
        discounts: { select: { level: true, discountPct: true } },
      } as any,
    });

    if (!p) throw new Error("Produto não encontrado");

    const levelDiscounts: Partial<Record<CustomerLevel, number>> = {};
    for (const row of (p as any).discounts ?? []) {
      const lvl = row.level as CustomerLevel;
      const pct = Number(row.discountPct);
      if (Number.isFinite(pct)) levelDiscounts[lvl] = pct;
    }

    return {
      productId: p.id,
      barberPercentage:
        p.barberPercentage === null || p.barberPercentage === undefined
          ? null
          : Number(p.barberPercentage),
      birthdayBenefitEnabled: Boolean(p.birthdayBenefitEnabled),
      birthdayPriceLevel: ((p as any).birthdayPriceLevel ??
        null) as CustomerLevel | null,
      isFeatured: Boolean((p as any).isFeatured ?? false),
      levelDiscounts,
    };
  } catch (e) {
    // 2) fallback sem esses campos (não quebra o modal)
    console.warn("[getProductPricing] fallback:", e);

    const p = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        barberPercentage: true,
        birthdayBenefitEnabled: true,
        birthdayPriceLevel: true,
      } as any,
    });

    if (!p) throw new Error("Produto não encontrado");

    return {
      productId: p.id,
      barberPercentage:
        p.barberPercentage === null || p.barberPercentage === undefined
          ? null
          : Number(p.barberPercentage),
      birthdayBenefitEnabled: Boolean(p.birthdayBenefitEnabled),
      birthdayPriceLevel: ((p as any).birthdayPriceLevel ??
        null) as CustomerLevel | null,
      isFeatured: false,
      levelDiscounts: {},
    };
  }
}

// ===== Funções base (prisma + revalidate) =====

export async function createProduct(formData: FormData) {
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
  const unitId = await getUnitIdFromFormOrDefault(formData);

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
    unit: { connect: { id: unitId } },
  };

  const created = await prisma.product.create({
    data: withFeaturedField(baseData, Boolean(isFeaturedParsed)) as any,
    select: { id: true },
  });

  await upsertProductDiscountsByLevel({
    productId: created.id,
    discounts: levelDiscounts,
  });

  revalidatePath("/admin/products");
}

export async function updateProduct(productId: string, formData: FormData) {
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

  await prisma.product.update({
    where: { id: productId },
    data: withFeaturedField(baseData, Boolean(isFeaturedParsed)) as any,
  });

  await upsertProductDiscountsByLevel({
    productId,
    discounts: levelDiscounts,
  });

  revalidatePath("/admin/products");
}

export async function toggleProductStatus(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { isActive: true },
  });

  if (!product) throw new Error("Produto não encontrado");

  await prisma.product.update({
    where: { id: productId },
    data: { isActive: !product.isActive },
  });

  revalidatePath("/admin/products");
}

// ✅ toggle do destaque (compat)
export async function toggleProductFeatured(productId: string) {
  const anyPrisma: any = prisma as any;
  const model = anyPrisma?._dmmf?.modelMap?.Product;
  const fields: Array<{ name: string }> = model?.fields ?? [];
  const hasIsFeatured = fields.some((f) => f?.name === "isFeatured");

  if (!hasIsFeatured) {
    throw new Error(
      "Campo isFeatured não existe no Prisma Client atual. Rode migration + prisma generate.",
    );
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { isFeatured: true },
  });

  if (!product) throw new Error("Produto não encontrado");

  await prisma.product.update({
    where: { id: productId },
    data: { isFeatured: !product.isFeatured },
  });

  revalidatePath("/admin/products");
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
