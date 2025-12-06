"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// 🔹 Helper: extrai string do FormData e valida
function getFormValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || !value) {
    throw new Error(`Campo obrigatório ausente: ${key}`);
  }
  return value;
}

/**
 * FINALIZAR VENDA
 *
 * - Só permite se o pedido estiver em PENDING_CHECKIN
 * - Garante que existem itens de produto
 * - Confere estoque de cada produto
 * - Cria ProductSale para cada item de produto
 * - Baixa estoque
 * - Marca o pedido como COMPLETED e define o barbeiro responsável
 */
export async function finalizeProductOrder(formData: FormData): Promise<void> {
  const orderId = getFormValue(formData, "orderId");
  const barberId = getFormValue(formData, "barberId");

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!order) {
      throw new Error("Pedido não encontrado.");
    }

    if (order.status !== "PENDING_CHECKIN") {
      throw new Error(
        "Apenas pedidos aguardando checkout podem ser finalizados.",
      );
    }

    const barber = await tx.barber.findUnique({
      where: { id: barberId, isActive: true },
    });

    if (!barber) {
      throw new Error("Barbeiro inválido ou inativo.");
    }

    const productItems = order.items.filter((item) => item.productId !== null);

    if (productItems.length === 0) {
      throw new Error("Este pedido não possui itens de produto.");
    }

    // 🔹 Confere estoque de todos os produtos antes de atualizar
    for (const item of productItems) {
      if (!item.product) {
        throw new Error("Produto vinculado ao pedido não foi encontrado.");
      }

      if (item.product.stockQuantity < item.quantity) {
        throw new Error(
          `Estoque insuficiente para o produto "${item.product.name}".`,
        );
      }
    }

    // 🔹 Para cada item de produto:
    // - baixa estoque
    // - cria ProductSale
    for (const item of productItems) {
      const product = item.product!;
      const productId = item.productId!;
      const quantity = item.quantity;
      const unitPrice = item.unitPrice; // Decimal
      const totalPrice = item.totalPrice; // Decimal

      // Baixa estoque
      await tx.product.update({
        where: { id: productId },
        data: {
          stockQuantity: product.stockQuantity - quantity,
        },
      });

      // Cria registro de venda de produto (ProductSale)
      await tx.productSale.create({
        data: {
          productId,
          barberId,
          quantity,
          unitPrice,
          totalPrice,
        },
      });
    }

    // 🔹 Atualiza status do pedido para COMPLETED e seta o barbeiro
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "COMPLETED",
        barberId,
      },
    });
  });

  // 🔹 Revalida telas relacionadas
  revalidatePath("/admin/checkout");
  revalidatePath("/client/history");
  revalidatePath("/client/products");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/finance");
  revalidatePath("/admin/clients");
  revalidatePath("/barber/earnings");
}

/**
 * CANCELAR PEDIDO
 *
 * - Só permite se o pedido estiver em PENDING_CHECKIN
 * - Não mexe em estoque
 * - Não cria ProductSale
 */
export async function cancelProductOrder(formData: FormData): Promise<void> {
  const orderId = getFormValue(formData, "orderId");

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error("Pedido não encontrado.");
    }

    if (order.status !== "PENDING_CHECKIN") {
      throw new Error(
        "Apenas pedidos aguardando checkout podem ser cancelados.",
      );
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "CANCELED",
      },
    });
  });

  revalidatePath("/admin/checkout");
  revalidatePath("/client/history");
}
