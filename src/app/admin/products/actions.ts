"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
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

  // ⭐ NOVO: ESTOQUE
  stockQuantity: z
    .string()
    .min(1, "Estoque obrigatório")
    .transform((val) => Number(val))
    .refine((val) => Number.isInteger(val) && val >= 0, {
      message: "Estoque deve ser um número inteiro maior ou igual a 0",
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

// ===== Actions =====

export async function createProduct(formData: FormData) {
  const parsed = createProductSchema.safeParse({
    name: formData.get("name"),
    imageUrl: formData.get("imageUrl"),
    description: formData.get("description"),
    price: formData.get("price"),
    barberPercentage: formData.get("barberPercentage"),
    category: formData.get("category"),
    stockQuantity: formData.get("stockQuantity"),
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
  } = parsed.data;

  const normalizedPrice = normalizePriceToDecimalString(price);

  await prisma.product.create({
    data: {
      name,
      imageUrl,
      description,
      price: new Prisma.Decimal(normalizedPrice),
      barberPercentage,
      category,
      stockQuantity,
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
