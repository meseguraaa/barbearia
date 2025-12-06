// app/admin/checkout/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/* ---------------------------------------------------------
 * HELPERS
 * ---------------------------------------------------------*/
async function withRevalidate<T>(operation: () => Promise<T>): Promise<T> {
  const result = await operation();

  // Revalida páginas relacionadas
  revalidatePath("/admin/checkout");
  revalidatePath("/admin/dashboard");
  revalidatePath("/barber");
  revalidatePath("/barber/earnings");

  return result;
}

/* ---------------------------------------------------------
 * PRODUTOS – fluxo antigo (PENDING_CHECKIN → COMPLETED)
 * ---------------------------------------------------------*/
export async function finalizeProductOrder(formData: FormData) {
  const orderId = formData.get("orderId") as string | null;
  const barberId = formData.get("barberId") as string | null;

  if (!orderId || !barberId) {
    throw new Error("Dados inválidos para finalizar pedido de produto.");
  }

  await withRevalidate(async () => {
    const order = await prisma.order.findUnique({
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
      // nada a fazer, evita mexer em pedido já finalizado/cancelado
      return;
    }

    // Atualiza estoque e cria registros de venda de produto
    const productItems = order.items.filter((item) => item.productId != null);

    await prisma.$transaction(async (tx) => {
      // Abate estoque e registra venda
      for (const item of productItems) {
        if (!item.productId || !item.product) continue;

        const newQuantity = item.product.stockQuantity - item.quantity;
        if (newQuantity < 0) {
          // Aqui você pode decidir se lança erro ou deixa negativo.
          // Por segurança, vamos limitar a zero.
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stockQuantity: 0,
            },
          });
        } else {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stockQuantity: newQuantity,
            },
          });
        }

        await tx.productSale.create({
          data: {
            productId: item.productId,
            barberId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          },
        });
      }

      // Marca o pedido como concluído
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: "COMPLETED",
          barberId,
        },
      });
    });
  });

  redirect("/admin/checkout");
}

export async function cancelProductOrder(formData: FormData) {
  const orderId = formData.get("orderId") as string | null;

  if (!orderId) {
    throw new Error("Dados inválidos para cancelar pedido de produto.");
  }

  await withRevalidate(async () => {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error("Pedido não encontrado.");
    }

    if (order.status === "COMPLETED" || order.status === "CANCELED") {
      return;
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "CANCELED",
      },
    });
  });

  redirect("/admin/checkout");
}

/* ---------------------------------------------------------
 * SERVIÇOS – novos (PENDING → COMPLETED / CANCELED)
 * ---------------------------------------------------------*/
export async function finalizeServiceOrder(formData: FormData) {
  const orderId = formData.get("orderId") as string | null;

  if (!orderId) {
    throw new Error("Dados inválidos para finalizar checkout de serviço.");
  }

  await withRevalidate(async () => {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        appointment: true,
        items: {
          include: {
            service: true,
          },
        },
      },
    });

    if (!order) {
      throw new Error("Pedido não encontrado.");
    }

    if (order.status !== "PENDING") {
      // já foi tratado, não faz nada
      return;
    }

    // Aqui não tem estoque pra mexer (é serviço),
    // então só marcamos como COMPLETED.
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "COMPLETED",
      },
    });
  });

  redirect("/admin/checkout");
}

export async function cancelServiceOrder(formData: FormData) {
  const orderId = formData.get("orderId") as string | null;

  if (!orderId) {
    throw new Error("Dados inválidos para cancelar checkout de serviço.");
  }

  await withRevalidate(async () => {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error("Pedido não encontrado.");
    }

    if (order.status === "COMPLETED" || order.status === "CANCELED") {
      return;
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "CANCELED",
      },
    });
  });

  redirect("/admin/checkout");
}
