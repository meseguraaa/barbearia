"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const purchaseSchema = z.object({
  productId: z.string(),
  barberId: z.string(),
  quantity: z.number().min(1),
});

export async function createProductSale(data: unknown) {
  const parsed = purchaseSchema.safeParse(data);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Dados inválidos");
  }

  const { productId, barberId, quantity } = parsed.data;

  return await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: productId, isActive: true },
    });

    if (!product) {
      throw new Error("Produto não encontrado ou inativo.");
    }

    if (product.stockQuantity < quantity) {
      throw new Error("Quantidade indisponível no estoque.");
    }

    const barber = await tx.barber.findUnique({
      where: { id: barberId, isActive: true },
    });

    if (!barber) {
      throw new Error("Barbeiro inválido.");
    }

    const unitPrice = product.price;
    const totalPrice = unitPrice.mul(quantity);

    const sale = await tx.productSale.create({
      data: {
        productId,
        barberId,
        quantity,
        unitPrice,
        totalPrice,
      },
    });

    await tx.product.update({
      where: { id: productId },
      data: {
        stockQuantity: product.stockQuantity - quantity,
      },
    });

    // Revalidate pages
    revalidatePath("/client/products");
    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/clients");
    revalidatePath("/admin/finance");
    revalidatePath("/painel");

    return { ok: true, saleId: sale.id };
  });
}
