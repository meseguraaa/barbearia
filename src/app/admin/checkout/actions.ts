// app/admin/checkout/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { requireAdminPermission } from "@/lib/admin-permissions";

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
 * UNIT SCOPE (mesma regra do page.tsx)
 * ---------------------------------------------------------*/
const UNIT_COOKIE_NAME = "admin_unit_context";
const UNIT_ALL_VALUE = "all";

/**
 * Resolve o "escopo" de unidade para as queries do admin.
 * - Dono: respeita cookie (all = tudo)
 * - Admin de unidade: ignora cookie e força unitId do admin
 */
async function resolveUnitScope(admin: {
  unitId: string | null;
  canSeeAllUnits: boolean;
}) {
  if (!admin.canSeeAllUnits) return admin.unitId;

  const cookieStore = await cookies();
  const cookieValue =
    cookieStore.get(UNIT_COOKIE_NAME)?.value ?? UNIT_ALL_VALUE;

  if (!cookieValue || cookieValue === UNIT_ALL_VALUE) return null;
  return cookieValue;
}

/**
 * Valida se um pedido pertence ao contexto de unidade ativo.
 * - Se activeUnitId = null (dono em "todas"), libera.
 * - Se activeUnitId != null, pedido precisa bater.
 */
function assertOrderInActiveUnit(
  order: { unitId: string | null },
  activeUnitId: string | null,
) {
  if (!activeUnitId) return;
  if (!order.unitId || order.unitId !== activeUnitId) {
    throw new Error("Este pedido não pertence à unidade selecionada.");
  }
}

/**
 * ✅ Estoque: não permite checkout se não houver quantidade suficiente.
 * (Mais seguro do que “zerar” e fingir que deu certo.)
 */
function assertEnoughStock(
  product: { name: string; stockQuantity: number },
  qty: number,
) {
  if (product.stockQuantity < qty) {
    throw new Error(
      `Estoque insuficiente para "${product.name}". Disponível: ${product.stockQuantity}, solicitado: ${qty}.`,
    );
  }
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

  // 🔐 Permissão + escopo de unidade (blindagem server-side)
  const admin = (await requireAdminPermission("canAccessCheckout")) as any;
  const activeUnitId = await resolveUnitScope({
    unitId: admin?.unitId ?? null,
    canSeeAllUnits: !!admin?.canSeeAllUnits,
  });

  await withRevalidate(async () => {
    // ✅ IMPORTANTE:
    // - serviços podem estar com order.clientId nulo e client ficar no appointment.clientId
    // - produtos geralmente ficam no order.clientId
    const [serviceOrders, productOrders] = await Promise.all([
      prisma.order.findMany({
        where: {
          status: "PENDING",
          ...(activeUnitId ? { unitId: activeUnitId } : {}),
          items: { some: { serviceId: { not: null } } },
          OR: [{ clientId }, { appointment: { clientId } }],
        } as any,
        select: {
          id: true,
          status: true,
          appointmentId: true,
          unitId: true,
          items: {
            select: {
              id: true,
              serviceId: true,
              productId: true,
            },
          },
        },
      }),

      prisma.order.findMany({
        where: {
          clientId,
          status: "PENDING_CHECKIN",
          ...(activeUnitId ? { unitId: activeUnitId } : {}),
          items: { some: { productId: { not: null } } },
        } as any,
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

    // Guard rails
    const anyServiceOrderInvalid = serviceOrders.some(
      (o) => !(o.items ?? []).some((it: any) => it.serviceId != null),
    );
    if (anyServiceOrderInvalid) {
      throw new Error(
        "Encontramos um pedido PENDING sem itens de serviço. Não é possível finalizar automaticamente.",
      );
    }

    const anyProductOrderInvalid = productOrders.some(
      (o) => !(o.items ?? []).some((it: any) => it.productId != null),
    );
    if (anyProductOrderInvalid) {
      throw new Error(
        "Encontramos um pedido PENDING_CHECKIN sem itens de produto. Não é possível finalizar automaticamente.",
      );
    }

    // Se houver produtos pendentes, barberId vira obrigatório
    if (productOrders.length > 0 && !barberId) {
      throw new Error(
        "Selecione o barbeiro responsável para finalizar a venda de produtos.",
      );
    }

    /**
     * ✅ REGRA MULTI-UNIDADE (CRÍTICA):
     * - Ao finalizar produtos, o barbeiro escolhido PRECISA pertencer à unidade do pedido.
     * - E uma “conta” não pode finalizar produtos de unidades diferentes num clique só.
     */
    if (productOrders.length > 0) {
      const unitIds = Array.from(
        new Set(productOrders.map((o) => o.unitId).filter(Boolean)),
      ) as string[];

      if (unitIds.length === 0) {
        throw new Error(
          "Pedidos de produto sem unidade vinculada. Não é possível finalizar.",
        );
      }

      if (unitIds.length > 1) {
        throw new Error(
          "Esta conta possui produtos de mais de uma unidade. Filtre por unidade e finalize separadamente.",
        );
      }

      const orderUnitId = unitIds[0];

      // Se o admin está com unidade ativa, a conta precisa estar dentro dela
      if (activeUnitId && orderUnitId !== activeUnitId) {
        throw new Error("Esta conta não pertence à unidade selecionada.");
      }

      const barberOk = await prisma.barber.findFirst({
        where: {
          id: barberId!,
          isActive: true,
          units: {
            some: {
              unitId: orderUnitId,
              isActive: true,
            },
          },
        },
        select: { id: true },
      });

      if (!barberOk) {
        throw new Error(
          "O profissional selecionado não pertence à unidade deste(s) pedido(s) de produto.",
        );
      }
    }

    // Também garante que os serviços dessa conta (se existirem) são da mesma unidade ativa (quando setado)
    if (activeUnitId) {
      const serviceOutside = serviceOrders.some(
        (o) => o.unitId !== activeUnitId,
      );
      if (serviceOutside) {
        throw new Error(
          "Existem atendimentos desta conta fora da unidade selecionada.",
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      // 1) Finaliza serviços
      for (const order of serviceOrders) {
        if (order.status !== "PENDING") continue;

        assertOrderInActiveUnit({ unitId: order.unitId ?? null }, activeUnitId);

        await tx.order.update({
          where: { id: order.id },
          data: {
            status: "COMPLETED",
          },
        });

        if (order.appointmentId) {
          await tx.appointment.updateMany({
            where: {
              id: order.appointmentId,
              status: "PENDING",
              ...(activeUnitId ? { unitId: activeUnitId } : {}),
            } as any,
            data: {
              status: "DONE",
              concludedByRole: "ADMIN",
            } as any,
          });
        }
      }

      // 2) Finaliza produtos (baixa estoque + cria productSale + status completed)
      for (const order of productOrders) {
        if (order.status !== "PENDING_CHECKIN") continue;

        assertOrderInActiveUnit({ unitId: order.unitId ?? null }, activeUnitId);

        if (!order.unitId) {
          throw new Error(
            "Pedido de produto sem unidade vinculada. Não é possível finalizar.",
          );
        }

        // ✅ Idempotência (anti-clique duplo / corrida):
        // re-busca status dentro da transação e só segue se ainda estiver PENDING_CHECKIN
        const fresh = await tx.order.findUnique({
          where: { id: order.id },
          select: { id: true, status: true },
        });

        if (!fresh || fresh.status !== "PENDING_CHECKIN") {
          continue;
        }

        // ✅ valida barbeiro pertence à unidade do pedido (segurança extra)
        const barberOk = await tx.barber.findFirst({
          where: {
            id: barberId!,
            isActive: true,
            units: {
              some: {
                unitId: order.unitId,
                isActive: true,
              },
            },
          },
          select: { id: true },
        });

        if (!barberOk) {
          throw new Error(
            "O profissional selecionado não pertence à unidade deste(s) pedido(s) de produto.",
          );
        }

        const productItems = order.items.filter(
          (item) => item.productId != null,
        );

        for (const item of productItems) {
          if (!item.productId || !item.product) continue;

          // ✅ valida estoque antes de baixar
          assertEnoughStock(
            {
              name: item.product.name,
              stockQuantity: item.product.stockQuantity,
            },
            item.quantity,
          );

          const newQuantity = item.product.stockQuantity - item.quantity;

          await tx.product.update({
            where: { id: item.productId },
            data: {
              stockQuantity: newQuantity,
            },
          });

          await tx.productSale.create({
            data: {
              product: { connect: { id: item.productId } },
              barber: { connect: { id: barberId! } },
              unit: { connect: { id: order.unitId } },
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

  // 🔐 Permissão + escopo de unidade (blindagem server-side)
  const admin = (await requireAdminPermission("canAccessCheckout")) as any;
  const activeUnitId = await resolveUnitScope({
    unitId: admin?.unitId ?? null,
    canSeeAllUnits: !!admin?.canSeeAllUnits,
  });

  await withRevalidate(async () => {
    await prisma.order.updateMany({
      where: {
        status: { in: ["PENDING", "PENDING_CHECKIN"] },
        ...(activeUnitId ? { unitId: activeUnitId } : {}),
        OR: [{ clientId }, { appointment: { clientId } }],
      } as any,
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

  // 🔐 Permissão + escopo de unidade (blindagem server-side)
  const admin = (await requireAdminPermission("canAccessCheckout")) as any;
  const activeUnitId = await resolveUnitScope({
    unitId: admin?.unitId ?? null,
    canSeeAllUnits: !!admin?.canSeeAllUnits,
  });

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

    assertOrderInActiveUnit({ unitId: order.unitId ?? null }, activeUnitId);

    if (order.status !== "PENDING_CHECKIN") {
      return;
    }

    if (!order.items.some((it) => it.productId != null)) {
      throw new Error("Este pedido não possui itens de produto.");
    }

    const productItems = order.items.filter((item) => item.productId != null);

    await prisma.$transaction(async (tx) => {
      if (!order.unitId) {
        throw new Error(
          "Pedido de produto sem unidade vinculada. Não é possível finalizar.",
        );
      }

      // ✅ recheck status dentro da transação (idempotência)
      const fresh = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      if (!fresh || fresh.status !== "PENDING_CHECKIN") return;

      // ✅ valida barbeiro pertence à unidade do pedido
      const barberOk = await tx.barber.findFirst({
        where: {
          id: barberId,
          isActive: true,
          units: {
            some: {
              unitId: order.unitId,
              isActive: true,
            },
          },
        },
        select: { id: true },
      });

      if (!barberOk) {
        throw new Error(
          "O profissional selecionado não pertence à unidade deste pedido.",
        );
      }

      for (const item of productItems) {
        if (!item.productId || !item.product) continue;

        // ✅ valida estoque antes de baixar
        assertEnoughStock(
          {
            name: item.product.name,
            stockQuantity: item.product.stockQuantity,
          },
          item.quantity,
        );

        const newQuantity = item.product.stockQuantity - item.quantity;

        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQuantity: newQuantity,
          },
        });

        await tx.productSale.create({
          data: {
            product: { connect: { id: item.productId } },
            barber: { connect: { id: barberId } },
            unit: { connect: { id: order.unitId } },
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

  // 🔐 Permissão + escopo de unidade (blindagem server-side)
  const admin = (await requireAdminPermission("canAccessCheckout")) as any;
  const activeUnitId = await resolveUnitScope({
    unitId: admin?.unitId ?? null,
    canSeeAllUnits: !!admin?.canSeeAllUnits,
  });

  await withRevalidate(async () => {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        unitId: true,
        items: { select: { productId: true } },
      },
    });

    if (!order) {
      throw new Error("Pedido não encontrado.");
    }

    assertOrderInActiveUnit({ unitId: order.unitId ?? null }, activeUnitId);

    if (order.status !== "PENDING_CHECKIN") {
      return;
    }

    if (!(order.items ?? []).some((it: any) => it.productId != null)) {
      throw new Error("Este pedido não possui itens de produto.");
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

  // 🔐 Permissão + escopo de unidade (blindagem server-side)
  const admin = (await requireAdminPermission("canAccessCheckout")) as any;
  const activeUnitId = await resolveUnitScope({
    unitId: admin?.unitId ?? null,
    canSeeAllUnits: !!admin?.canSeeAllUnits,
  });

  await withRevalidate(async () => {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        appointmentId: true,
        unitId: true,
        items: { select: { serviceId: true } },
      },
    });

    if (!order) {
      throw new Error("Pedido não encontrado.");
    }

    assertOrderInActiveUnit({ unitId: order.unitId ?? null }, activeUnitId);

    if (order.status !== "PENDING") {
      return;
    }

    if (!(order.items ?? []).some((it: any) => it.serviceId != null)) {
      throw new Error("Este pedido não possui itens de serviço.");
    }

    await prisma.$transaction(async (tx) => {
      // ✅ idempotência
      const fresh = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      if (!fresh || fresh.status !== "PENDING") return;

      await tx.order.update({
        where: { id: orderId },
        data: { status: "COMPLETED" },
      });

      if (order.appointmentId) {
        await tx.appointment.updateMany({
          where: {
            id: order.appointmentId,
            status: "PENDING",
            ...(activeUnitId ? { unitId: activeUnitId } : {}),
          } as any,
          data: {
            status: "DONE",
            concludedByRole: "ADMIN",
          } as any,
        });
      }
    });
  });

  redirect(getRedirectTo(formData));
}

export async function cancelServiceOrder(formData: FormData) {
  const orderId = formData.get("orderId") as string | null;

  if (!orderId) {
    throw new Error("Dados inválidos para cancelar checkout de serviço.");
  }

  // 🔐 Permissão + escopo de unidade (blindagem server-side)
  const admin = (await requireAdminPermission("canAccessCheckout")) as any;
  const activeUnitId = await resolveUnitScope({
    unitId: admin?.unitId ?? null,
    canSeeAllUnits: !!admin?.canSeeAllUnits,
  });

  await withRevalidate(async () => {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        appointmentId: true,
        unitId: true,
        items: { select: { serviceId: true } },
      },
    });

    if (!order) {
      throw new Error("Pedido não encontrado.");
    }

    assertOrderInActiveUnit({ unitId: order.unitId ?? null }, activeUnitId);

    if (order.status !== "PENDING") {
      return;
    }

    if (!(order.items ?? []).some((it: any) => it.serviceId != null)) {
      throw new Error("Este pedido não possui itens de serviço.");
    }

    await prisma.$transaction(async (tx) => {
      // ✅ idempotência
      const fresh = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      if (!fresh || fresh.status !== "PENDING") return;

      await tx.order.update({
        where: { id: orderId },
        data: { status: "CANCELED" },
      });

      if (order.appointmentId) {
        await tx.appointment.updateMany({
          where: {
            id: order.appointmentId,
            status: "PENDING",
            ...(activeUnitId ? { unitId: activeUnitId } : {}),
          } as any,
          data: {
            status: "CANCELED",
            cancelledByRole: "ADMIN",
          } as any,
        });
      }
    });
  });

  redirect(getRedirectTo(formData));
}
