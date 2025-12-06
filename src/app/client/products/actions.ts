"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const purchaseSchema = z.object({
  productId: z.string(),
  quantity: z.number().min(1),
  // 🔹 opcionalmente podemos vincular ao cliente
  clientId: z.string().optional(),
});

/**
 * Pedido de produto feito pelo CLIENTE (fora da barbearia).
 *
 * - NÃO baixa estoque
 * - NÃO registra ProductSale
 * - Cria Order com status PENDING_CHECKIN
 */
export async function createProductSale(data: unknown) {
  const parsed = purchaseSchema.safeParse(data);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Dados inválidos");
  }

  const { productId, quantity, clientId } = parsed.data;

  return await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: productId, isActive: true },
    });

    if (!product) {
      throw new Error("Produto não encontrado ou inativo.");
    }

    // 🔹 Mesmo sem baixar estoque agora, garantimos que a quantidade faz sentido
    if (product.stockQuantity < quantity) {
      throw new Error("Quantidade indisponível no estoque.");
    }

    const unitPrice = product.price; // Decimal
    const totalPrice = unitPrice.mul(quantity); // Decimal

    // 🔹 Cria o PEDIDO com status PENDING_CHECKIN (intenção de compra)
    const order = await tx.order.create({
      data: {
        clientId: clientId ?? null, // pedido vinculado ao cliente, quando logado
        appointmentId: null, // não está ligado a um atendimento
        barberId: null, // barbeiro será definido na barbearia, na finalização
        status: "PENDING_CHECKIN",
        totalAmount: totalPrice,
        items: {
          create: [
            {
              productId,
              quantity,
              unitPrice,
              totalPrice,
            },
          ],
        },
      },
    });

    // Revalidate das telas relevantes para o cliente
    revalidatePath("/client/products");
    revalidatePath("/client/history");

    return { ok: true, orderId: order.id };
  });
}
