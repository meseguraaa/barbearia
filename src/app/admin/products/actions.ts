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

function parseOptionalDecimalFromFormValue(val: unknown): string | null {
  const s = String(val ?? "").trim();
  if (!s) return null;
  const normalized = normalizePriceToDecimalString(s);
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return normalized;
}

function parseBoolFromForm(formData: FormData, key: string): boolean {
  const v = formData.get(key);
  if (v === null || v === undefined) return false;
  const s = String(v).toLowerCase();
  return s === "true" || s === "1" || s === "on" || s === "yes";
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
  // ✅ aqui está o fix do erro: "" vira undefined e não quebra enum
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
 * Lê preços por nível do form (opcional).
 */
function readLevelPricesFromForm(
  formData: FormData,
): Partial<Record<CustomerLevel, string>> {
  const getFirst = (keys: string[]) => {
    for (const k of keys) {
      const v = formData.get(k);
      const parsed = parseOptionalDecimalFromFormValue(v);
      if (parsed !== null) return parsed;
    }
    return null;
  };

  const bronze = getFirst(["priceBronze", "levelPriceBronze", "price_BRONZE"]);
  const prata = getFirst(["pricePrata", "levelPricePrata", "price_PRATA"]);
  const ouro = getFirst(["priceOuro", "levelPriceOuro", "price_OURO"]);
  const diamante = getFirst([
    "priceDiamante",
    "levelPriceDiamante",
    "price_DIAMANTE",
  ]);

  const out: Partial<Record<CustomerLevel, string>> = {};
  if (bronze !== null) out.BRONZE = bronze;
  if (prata !== null) out.PRATA = prata;
  if (ouro !== null) out.OURO = ouro;
  if (diamante !== null) out.DIAMANTE = diamante;
  return out;
}

async function upsertProductPricesByLevel(args: {
  productId: string;
  prices: Partial<Record<CustomerLevel, string>>;
}) {
  const entries = Object.entries(args.prices) as Array<[CustomerLevel, string]>;
  if (entries.length === 0) return;

  await prisma.$transaction(
    entries.map(([level, priceStr]) =>
      prisma.productPriceByLevel.upsert({
        where: { productId_level: { productId: args.productId, level } },
        create: {
          productId: args.productId,
          level,
          price: new Prisma.Decimal(priceStr),
        },
        update: {
          price: new Prisma.Decimal(priceStr),
        },
      }),
    ),
  );
}

/**
 * 🔒 Compat: só inclui isFeatured no payload se o Prisma Client reconhecer o campo.
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

// ✅ buscar pricing completo pra preencher modal de edição
export async function getProductPricing(productId: string) {
  const anyPrisma: any = prisma as any;
  const model = anyPrisma?._dmmf?.modelMap?.Product;
  const fields: Array<{ name: string }> = model?.fields ?? [];
  const hasIsFeatured = fields.some((f) => f?.name === "isFeatured");

  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      birthdayBenefitEnabled: true,
      birthdayPriceLevel: true,
      ...(hasIsFeatured ? { isFeatured: true } : {}),
      prices: { select: { level: true, price: true } },
    } as any,
  });

  if (!p) throw new Error("Produto não encontrado");

  const levelPrices: Partial<Record<CustomerLevel, number>> = {};
  for (const row of (p as any).prices ?? []) {
    levelPrices[row.level as CustomerLevel] = Number(row.price);
  }

  return {
    productId: (p as any).id,
    birthdayBenefitEnabled: Boolean((p as any).birthdayBenefitEnabled),
    birthdayPriceLevel: ((p as any).birthdayPriceLevel ??
      null) as CustomerLevel | null,
    isFeatured: Boolean((p as any).isFeatured ?? false),
    levelPrices,
  };
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
    // ✅ pode vir "", null, etc. o preprocess resolve
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

  const levelPrices = readLevelPricesFromForm(formData);
  if (!levelPrices.BRONZE) levelPrices.BRONZE = normalizedPrice;

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

  await upsertProductPricesByLevel({
    productId: created.id,
    prices: levelPrices,
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
    // ✅ pode vir "" quando usuário mexe no form: preprocess evita crash
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
  const levelPrices = readLevelPricesFromForm(formData);

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

  if (Object.keys(levelPrices).length > 0 && !levelPrices.BRONZE) {
    levelPrices.BRONZE = normalizedPrice;
  }

  await upsertProductPricesByLevel({
    productId,
    prices: levelPrices,
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
