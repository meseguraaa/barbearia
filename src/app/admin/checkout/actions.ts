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

function getRedirectTo(formData: FormData) {
  const redirectTo = formData.get("redirectTo") as string | null;
  if (!redirectTo) return "/admin/checkout";
  if (typeof redirectTo !== "string") return "/admin/checkout";
  if (!redirectTo.startsWith("/")) return "/admin/checkout";
  return redirectTo;
}

/* ---------------------------------------------------------
 * NOVO: CONTA DO CLIENTE (Opção A)
 * ---------------------------------------------------------*/
export async function finalizeClientOpenOrders(formData: FormData) {
  const clientId = formData.get("clientId") as string | null;
  const barberId = (formData.get("barberId") as string | null) || null;

  if (!clientId) {
    throw new Error("clientId é obrigatório para finalizar a conta.");
  }

  await withRevalidate(async () => {
    // Busca pedidos abertos do cliente
    const [serviceOrders, productOrders] = await Promise.all([
      prisma.order.findMany({
        where: {
          clientId,
          status: "PENDING",
          items: { some: { serviceId: { not: null } } },
        },
        select: { id: true, status: true },
      }),

      prisma.order.findMany({
        where: {
          clientId,
          status: "PENDING_CHECKIN",
          items: { some: { productId: { not: null } } },
        },
        include: {
          items: {
            include: {
              product: true,
            },
          },
        },
      }),
    ]);

    // Nada aberto? só sai
    if (serviceOrders.length === 0 && productOrders.length === 0) return;

    // Se houver produtos pendentes, barberId vira obrigatório (mesma regra do fluxo antigo)
    if (productOrders.length > 0 && !barberId) {
      throw new Error(
        "Selecione o barbeiro responsável para finalizar a venda de produtos.",
      );
    }

    await prisma.$transaction(async (tx) => {
      // 1) Finaliza serviços (só muda status)
      for (const order of serviceOrders) {
        // dupla checagem de status (evita corrida)
        if (order.status !== "PENDING") continue;

        await tx.order.update({
          where: { id: order.id },
          data: { status: "COMPLETED" },
        });
      }

      // 2) Finaliza produtos (baixa estoque + cria productSale + status completed)
      for (const order of productOrders) {
        // dupla checagem (evita mexer se já mudou)
        if (order.status !== "PENDING_CHECKIN") continue;

        const productItems = order.items.filter(
          (item) => item.productId != null,
        );

        for (const item of productItems) {
          if (!item.productId || !item.product) continue;

          const newQuantity = item.product.stockQuantity - item.quantity;

          await tx.product.update({
            where: { id: item.productId },
            data: {
              stockQuantity: newQuantity < 0 ? 0 : newQuantity,
            },
          });

          await tx.productSale.create({
            data: {
              productId: item.productId,
              barberId: barberId!, // aqui já garantimos que existe
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            },
          });
        }

        await tx.order.update({
          where: { id: order.id },
          data: {
            status: "COMPLETED",
            barberId: barberId!,
          },
        });
      }
    });
  });

  redirect(getRedirectTo(formData));
}

export async function cancelClientOpenOrders(formData: FormData) {
  const clientId = formData.get("clientId") as string | null;

  if (!clientId) {
    throw new Error("clientId é obrigatório para cancelar a conta.");
  }

  await withRevalidate(async () => {
    // Cancela tudo que estiver “aberto” para checkout
    await prisma.order.updateMany({
      where: {
        clientId,
        status: { in: ["PENDING", "PENDING_CHECKIN"] },
      },
      data: {
        status: "CANCELED",
      },
    });
  });

  redirect(getRedirectTo(formData));
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
      return;
    }

    const productItems = order.items.filter((item) => item.productId != null);

    await prisma.$transaction(async (tx) => {
      for (const item of productItems) {
        if (!item.productId || !item.product) continue;

        const newQuantity = item.product.stockQuantity - item.quantity;

        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQuantity: newQuantity < 0 ? 0 : newQuantity,
          },
        });

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

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: "COMPLETED",
          barberId,
        },
      });
    });
  });

  redirect(getRedirectTo(formData));
}

export async function cancelProductOrder(formData: FormData) {
  const orderId = formData.get("orderId") as string | null;

  if (!orderId) {
    throw new Error("Dados inválidos para cancelar pedido de produto.");
  }

  await withRevalidate(async () => {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    });

    if (!order) {
      throw new Error("Pedido não encontrado.");
    }

    // ✅ aqui restringe: só cancela produto se estiver no status do fluxo de produto
    if (order.status !== "PENDING_CHECKIN") {
      return;
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "CANCELED",
      },
    });
  });

  redirect(getRedirectTo(formData));
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
      select: { id: true, status: true },
    });

    if (!order) {
      throw new Error("Pedido não encontrado.");
    }

    if (order.status !== "PENDING") {
      return;
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "COMPLETED",
      },
    });
  });

  redirect(getRedirectTo(formData));
}

export async function cancelServiceOrder(formData: FormData) {
  const orderId = formData.get("orderId") as string | null;

  if (!orderId) {
    throw new Error("Dados inválidos para cancelar checkout de serviço.");
  }

  await withRevalidate(async () => {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    });

    if (!order) {
      throw new Error("Pedido não encontrado.");
    }

    if (order.status !== "PENDING") {
      return;
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "CANCELED",
      },
    });
  });

  redirect(getRedirectTo(formData));
}
