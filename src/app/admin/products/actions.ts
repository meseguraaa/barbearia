"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";

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
});

const createProductSchema = baseProductSchema;
const updateProductSchema = baseProductSchema;

// ===== Helpers =====

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

// ===== Funções base (trabalham com prisma + revalidate) =====

export async function createProduct(formData: FormData) {
  const parsed = createProductSchema.safeParse({
    name: formData.get("name"),
    imageUrl: formData.get("imageUrl"),
    description: formData.get("description"),
    price: formData.get("price"),
    barberPercentage: formData.get("barberPercentage"),
    category: formData.get("category"),
    stockQuantity: formData.get("stockQuantity"),
    pickupDeadlineDays: formData.get("pickupDeadlineDays"),
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
  } = parsed.data;

  const normalizedPrice = normalizePriceToDecimalString(price);
  const unitId = await getUnitIdFromFormOrDefault(formData);

  await prisma.product.create({
    data: {
      name,
      imageUrl,
      description,
      price: new Prisma.Decimal(normalizedPrice),
      barberPercentage,
      category,
      stockQuantity,
      pickupDeadlineDays,

      // ✅ obrigatório agora
      unit: { connect: { id: unitId } },
    },
  });

  revalidatePath("/admin/products");
}

export async function updateProduct(productId: string, formData: FormData) {
  const parsed = updateProductSchema.safeParse({
    name: formData.get("name"),
    imageUrl: formData.get("imageUrl"),
    description: formData.get("description"),
    price: formData.get("price"),
    barberPercentage: formData.get("barberPercentage"),
    category: formData.get("category"),
    stockQuantity: formData.get("stockQuantity"),
    pickupDeadlineDays: formData.get("pickupDeadlineDays"),
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
  } = parsed.data;

  const normalizedPrice = normalizePriceToDecimalString(price);

  await prisma.product.update({
    where: { id: productId },
    data: {
      name,
      imageUrl,
      description,
      price: new Prisma.Decimal(normalizedPrice),
      barberPercentage,
      category,
      stockQuantity,
      pickupDeadlineDays,
      // ⚠️ não mexo em unit aqui pra não “mover produto de unidade” sem querer
    },
  });

  revalidatePath("/admin/products");
}

export async function toggleProductStatus(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { isActive: true },
  });

  if (!product) {
    throw new Error("Produto não encontrado");
  }

  await prisma.product.update({
    where: { id: productId },
    data: {
      isActive: !product.isActive,
    },
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
  // só revalida; sem redirect
}
