"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const purchaseSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1),
  // 🔹 opcionalmente podemos vincular ao cliente
  clientId: z.string().optional(),
});

/**
 * Pedido de produto feito pelo CLIENTE (fora da barbearia).
 *
 * - NÃO baixa estoque
 * - NÃO registra ProductSale
 * - Cria Order com status PENDING_CHECKIN
 * - Salva reservedUntil baseado no prazo do produto (pickupDeadlineDays)
 */
export async function createProductSale(data: unknown) {
  const parsed = purchaseSchema.safeParse(data);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Dados inválidos");
  }

  const { productId, quantity, clientId } = parsed.data;

  return await prisma.$transaction(async (tx) => {
    // ✅ findUnique NÃO aceita filtro com isActive (campo não-unique)
    // então usamos findFirst
    const product = await tx.product.findFirst({
      where: { id: productId, isActive: true },
      select: {
        id: true,
        stockQuantity: true,
        price: true,
        pickupDeadlineDays: true,
        unitId: true, // ✅ obrigatório para Order
      },
    });

    if (!product) {
      throw new Error("Produto não encontrado ou inativo.");
    }

    if (!product.unitId) {
      throw new Error(
        "Produto sem unidade vinculada (unitId). Não é possível criar o pedido.",
      );
    }

    // 🔹 Mesmo sem baixar estoque agora, garantimos que a quantidade faz sentido
    if (product.stockQuantity < quantity) {
      throw new Error("Quantidade indisponível no estoque.");
    }

    const unitPrice = product.price; // Decimal
    const totalPrice = unitPrice.mul(quantity); // Decimal

    // ✅ Prazo de retirada (em dias)
    const deadlineDays =
      typeof product.pickupDeadlineDays === "number" &&
      Number.isFinite(product.pickupDeadlineDays) &&
      product.pickupDeadlineDays > 0
        ? product.pickupDeadlineDays
        : 2;

    const reservedUntil = new Date();
    reservedUntil.setDate(reservedUntil.getDate() + deadlineDays);

    // 🔹 Cria o PEDIDO com status PENDING_CHECKIN (intenção de compra)
    const order = await tx.order.create({
      data: {
        clientId: clientId ?? null,
        appointmentId: null,
        barberId: null,
        status: "PENDING_CHECKIN",
        reservedUntil,
        totalAmount: totalPrice,

        // ✅ fix do TS + regra multi-unidade
        unitId: product.unitId,

        items: {
          create: [
            {
              productId: product.id,
              quantity,
              unitPrice,
              totalPrice,
            },
          ],
        },
      },
      select: { id: true },
    });

    revalidatePath("/client/products");
    revalidatePath("/client/history");

    return { ok: true, orderId: order.id, reservedUntil };
  });
}
