// app/admin/checkout/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { Prisma } from "@prisma/client";
import { requireAdminPermission } from "@/lib/admin-permissions";

/* ---------------------------------------------------------
 * HELPERS
 * ---------------------------------------------------------*/
async function withRevalidate<T>(operation: () => Promise<T>): Promise<T> {
  const result = await operation();

  revalidatePath("/admin/checkout");
  revalidatePath("/admin/dashboard");
  revalidatePath("/barber");
  revalidatePath("/barber/earnings");

  return result;
}

function getRedirectTo(formData: FormData): string {
  const redirectTo = formData.get("redirectTo") as string | null;
  if (!redirectTo) return "/admin/checkout";
  if (typeof redirectTo !== "string") return "/admin/checkout";
  if (!redirectTo.startsWith("/")) return "/admin/checkout";
  return redirectTo;
}

function assertPositiveInt(n: number, label: string): void {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${label} inválido.`);
  }
}

function toNumberDecimal(v: unknown): number {
  if (v == null) return NaN;
  if (typeof v === "number") return v;

  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  }

  if (typeof v === "object") {
    const anyObj = v as any;

    if (typeof anyObj.toNumber === "function") {
      const n = anyObj.toNumber();
      return Number.isFinite(n) ? n : NaN;
    }

    if (typeof anyObj.toString === "function") {
      const n = Number(String(anyObj.toString()).replace(",", "."));
      return Number.isFinite(n) ? n : NaN;
    }
  }

  return NaN;
}

function money(n: unknown): number {
  const v = toNumberDecimal(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function calcServiceSubtotal(
  items: Array<{
    quantity: number;
    unitPrice: any | null;
    totalPrice: any | null;
    service?: { price: any | null } | null;
  }>,
): number {
  let total = 0;

  for (const it of items) {
    const qty = Number(it.quantity ?? 0) || 0;
    if (qty <= 0) continue;

    const totalPrice = toNumberDecimal(it.totalPrice);
    if (Number.isFinite(totalPrice) && totalPrice >= 0) {
      total += totalPrice;
      continue;
    }

    const unitPrice = toNumberDecimal(it.unitPrice);
    if (Number.isFinite(unitPrice) && unitPrice >= 0) {
      total += unitPrice * qty;
      continue;
    }

    const basePrice = toNumberDecimal(it.service?.price);
    if (Number.isFinite(basePrice) && basePrice >= 0) {
      total += basePrice * qty;
      continue;
    }
  }

  return money(total);
}

function calcCommission(serviceSubtotal: number, pct: number): number {
  if (!Number.isFinite(serviceSubtotal) || serviceSubtotal <= 0) return 0;
  if (!Number.isFinite(pct) || pct < 0) return 0;
  return money((serviceSubtotal * pct) / 100);
}

/* ---------------------------------------------------------
 * MULTI-TENANT (company scope)
 * ---------------------------------------------------------*/
function requireCompanyIdFromAdmin(admin: any): string {
  const companyId = admin?.companyId as string | undefined;
  if (!companyId) {
    throw new Error("Contexto inválido: companyId ausente no admin.");
  }
  return companyId;
}

function assertOrderInCompany(order: { companyId: string }, companyId: string) {
  if (!order.companyId || order.companyId !== companyId) {
    throw new Error("Este pedido não pertence a esta empresa.");
  }
}

/* ---------------------------------------------------------
 * UNIT SCOPE (mesma regra do page.tsx)
 * ---------------------------------------------------------*/
const UNIT_COOKIE_NAME = "admin_unit_context";
const UNIT_ALL_VALUE = "all";

async function resolveUnitScope(admin: {
  unitId: string | null;
  canSeeAllUnits: boolean;
}): Promise<string | null> {
  if (!admin.canSeeAllUnits) return admin.unitId;

  const cookieStore = await cookies();
  const cookieValue =
    cookieStore.get(UNIT_COOKIE_NAME)?.value ?? UNIT_ALL_VALUE;

  if (!cookieValue || cookieValue === UNIT_ALL_VALUE) return null;
  return cookieValue;
}

function assertOrderInActiveUnit(
  order: { unitId: string | null },
  activeUnitId: string | null,
): void {
  if (!activeUnitId) return;
  if (!order.unitId || order.unitId !== activeUnitId) {
    throw new Error("Este pedido não pertence à unidade selecionada.");
  }
}

function assertEnoughStock(
  product: { name: string; stockQuantity: number },
  qty: number,
): void {
  if (product.stockQuantity < qty) {
    throw new Error(
      `Estoque insuficiente para "${product.name}". Disponível: ${product.stockQuantity}, solicitado: ${qty}.`,
    );
  }
}

/* ---------------------------------------------------------
 * 🔥 MOTOR DE PREÇO (DESCONTO PERCENTUAL POR NÍVEL)
 * ---------------------------------------------------------*/
type CustomerLevel = "BRONZE" | "PRATA" | "OURO" | "DIAMANTE";

const LEVEL_FALLBACK: Record<CustomerLevel, CustomerLevel[]> = {
  DIAMANTE: ["DIAMANTE", "OURO", "PRATA", "BRONZE"],
  OURO: ["OURO", "PRATA", "BRONZE"],
  PRATA: ["PRATA", "BRONZE"],
  BRONZE: ["BRONZE"],
};

function getDatePartsInTz(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
  };
}

function tzMidnightUtc(year: number, month: number, day: number): Date {
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0",
  )}-${String(day).padStart(2, "0")}T00:00:00`;
  return new Date(iso + "Z");
}

function addDaysUtc(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function isWithinInclusive(date: Date, start: Date, end: Date): boolean {
  const t = date.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

async function resolveProductUnitPrice(args: {
  companyId: string;
  productId: string;
  clientId: string | null;
  effectiveLevel?: CustomerLevel;
  timeZone?: string;
  now?: Date;
}): Promise<{
  unitId: string;
  unitPrice: number;
  appliedLevel: CustomerLevel;
  appliedBecause: "BIRTHDAY" | "LEVEL" | "BASE";
  inBirthdayWindow: boolean;
  productName: string;
  discountPct: number;
}> {
  const timeZone = args.timeZone ?? "America/Sao_Paulo";
  const now = args.now ?? new Date();
  const effectiveLevel: CustomerLevel = args.effectiveLevel ?? "BRONZE";

  const [product, client] = await Promise.all([
    prisma.product.findFirst({
      where: {
        id: args.productId,
        companyId: args.companyId,
        isActive: true,
      } as any,
      select: {
        id: true,
        companyId: true,
        name: true,
        price: true,
        unitId: true,
        stockQuantity: true,
        birthdayBenefitEnabled: true,
        birthdayPriceLevel: true,
        discounts: { select: { level: true, discountPct: true } },
      } as any,
    }),
    args.clientId
      ? prisma.user.findFirst({
          where: { id: args.clientId } as any,
          select: { id: true, birthday: true },
        })
      : Promise.resolve(null),
  ]);

  if (!product) throw new Error("Produto não encontrado.");

  if (
    typeof (product as any).stockQuantity === "number" &&
    (product as any).stockQuantity <= 0
  ) {
    throw new Error("Produto sem estoque.");
  }

  const basePrice = toNumberDecimal((product as any).price);
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    throw new Error("Preço base do produto inválido.");
  }

  // desconto percentual por nível (guarda só > 0)
  const pctByLevel = new Map<CustomerLevel, number>();
  for (const row of (product as any).discounts ?? []) {
    const lvl = row.level as CustomerLevel;
    const pct = clampPct(Number(row.discountPct ?? 0));
    if (pct > 0) pctByLevel.set(lvl, pct);
  }

  function pickDiscountPct(level: CustomerLevel): {
    level: CustomerLevel;
    pct: number;
  } {
    for (const l of LEVEL_FALLBACK[level]) {
      const pct = pctByLevel.get(l);
      if (pct !== undefined) return { level: l, pct };
    }
    return { level: "BRONZE", pct: 0 };
  }

  function applyDiscount(price: number, pct: number): number {
    const p = clampPct(pct);
    const final = price * (1 - p / 100);
    return money(final);
  }

  // Janela de aniversário: +/- 3 dias
  let inBirthdayWindow = false;

  if (client?.birthday && (product as any).birthdayBenefitEnabled) {
    const nowParts = getDatePartsInTz(now, timeZone);
    const b = getDatePartsInTz(client.birthday, timeZone);

    const birthdayThisYear = tzMidnightUtc(nowParts.year, b.month, b.day);
    const start = addDaysUtc(birthdayThisYear, -3);
    const end = addDaysUtc(birthdayThisYear, +3);

    const todayAnchor = tzMidnightUtc(
      nowParts.year,
      nowParts.month,
      nowParts.day,
    );

    inBirthdayWindow = isWithinInclusive(todayAnchor, start, end);
  }

  if (inBirthdayWindow && (product as any).birthdayBenefitEnabled) {
    const chosen =
      ((product as any).birthdayPriceLevel as CustomerLevel | null) ??
      "DIAMANTE";

    const picked = pickDiscountPct(chosen);
    const unitPrice = applyDiscount(basePrice, picked.pct);

    return {
      unitId: (product as any).unitId as string,
      unitPrice,
      appliedLevel: picked.level,
      appliedBecause: "BIRTHDAY",
      inBirthdayWindow: true,
      productName: (product as any).name as string,
      discountPct: picked.pct,
    };
  }

  const picked = pickDiscountPct(effectiveLevel);
  const unitPrice = applyDiscount(basePrice, picked.pct);

  return {
    unitId: (product as any).unitId as string,
    unitPrice,
    appliedLevel: picked.level,
    appliedBecause: picked.pct > 0 ? "LEVEL" : "BASE",
    inBirthdayWindow: false,
    productName: (product as any).name as string,
    discountPct: picked.pct,
  };
}

/* ---------------------------------------------------------
 * ✅ Reprecificar itens do pedido (produto) antes de finalizar
 * ---------------------------------------------------------*/
async function repriceProductOrderInTx(args: {
  tx: any;
  companyId: string;
  order: any;
  clientId: string;
  timeZone?: string;
}) {
  const { tx, companyId, order, clientId } = args;
  const timeZone = args.timeZone ?? "America/Sao_Paulo";

  const items = (order.items ?? []).filter((it: any) => it.productId != null);

  const repriced = await Promise.all(
    items.map(async (it: any) => {
      const qty = Math.max(1, Number(it.quantity ?? 1));
      const pricing = await resolveProductUnitPrice({
        companyId,
        productId: String(it.productId),
        clientId,
        timeZone,
      });

      const unitPrice = money(pricing.unitPrice);
      const totalPrice = money(unitPrice * qty);

      return {
        id: it.id,
        productId: String(it.productId),
        quantity: qty,
        unitPrice,
        totalPrice,
      };
    }),
  );

  for (const it of repriced) {
    await tx.orderItem.updateMany({
      where: { id: it.id, orderId: order.id, companyId } as any,
      data: { unitPrice: it.unitPrice, totalPrice: it.totalPrice } as any,
    });
  }

  const totalAmount = money(
    repriced.reduce((acc, it) => acc + it.totalPrice, 0),
  );

  await tx.order.updateMany({
    where: { id: order.id, companyId } as any,
    data: { totalAmount } as any,
  });

  return { items: repriced, totalAmount };
}

/* ---------------------------------------------------------
 * ✅ Adicionar produto na conta (PENDING_CHECKIN)
 * - agora valida estoque de verdade (considerando item existente)
 * ---------------------------------------------------------*/
export async function addProductToClientOpenOrder(
  formData: FormData,
): Promise<void> {
  const clientId = formData.get("clientId") as string | null;
  const productId = formData.get("productId") as string | null;

  const qtyRaw = formData.get("quantity");
  const quantity = Number(qtyRaw ?? 1);

  if (!clientId) throw new Error("clientId é obrigatório.");
  if (!productId) throw new Error("productId é obrigatório.");
  assertPositiveInt(quantity, "Quantidade");

  const admin = (await requireAdminPermission("canAccessCheckout")) as any;
  const companyId = requireCompanyIdFromAdmin(admin);

  const activeUnitId = await resolveUnitScope({
    unitId: admin?.unitId ?? null,
    canSeeAllUnits: !!admin?.canSeeAllUnits,
  });

  await withRevalidate(async () => {
    const resolved = await resolveProductUnitPrice({
      companyId,
      productId,
      clientId,
      timeZone: "America/Sao_Paulo",
    });

    if (activeUnitId && resolved.unitId !== activeUnitId) {
      throw new Error("Este produto não pertence à unidade selecionada.");
    }

    await prisma.$transaction(async (tx) => {
      // ✅ pega produto “de verdade” no tx para validar estoque
      const product = await tx.product.findFirst({
        where: { id: productId, companyId, isActive: true } as any,
        select: { id: true, name: true, stockQuantity: true, unitId: true },
      });

      if (!product) throw new Error("Produto não encontrado.");
      if ((product as any).unitId !== resolved.unitId) {
        throw new Error("Produto não pertence a esta unidade.");
      }

      const existing = await tx.order.findFirst({
        where: {
          companyId,
          clientId,
          unitId: resolved.unitId,
          status: "PENDING_CHECKIN",
          items: { some: { productId: { not: null } } },
        } as any,
        include: { items: true },
        orderBy: { createdAt: "desc" },
      });

      let orderId = existing?.id;

      if (!orderId) {
        const created = await tx.order.create({
          data: {
            companyId,
            clientId,
            unitId: resolved.unitId,
            status: "PENDING_CHECKIN",
            totalAmount: 0,
          } as any,
          select: { id: true },
        });
        orderId = created.id;
      }

      const currentItem =
        existing?.items?.find(
          (it: any) => String(it.productId) === productId,
        ) ?? null;

      // ✅ sempre usa o preço atual do motor (aniversário/nível)
      const unitPrice = money(resolved.unitPrice);

      const currentQty = currentItem
        ? Math.max(1, Number(currentItem.quantity ?? 0))
        : 0;
      const newQty = currentQty + quantity;

      // ✅ valida estoque considerando quantidade final do item
      assertEnoughStock(
        { name: product.name, stockQuantity: product.stockQuantity },
        newQty,
      );

      if (currentItem) {
        const totalPrice = money(unitPrice * newQty);

        await tx.orderItem.updateMany({
          where: { id: currentItem.id, orderId, companyId } as any,
          data: { quantity: newQty, unitPrice, totalPrice } as any,
        });
      } else {
        const totalPrice = money(unitPrice * quantity);

        await tx.orderItem.create({
          data: {
            companyId,
            order: { connect: { id: orderId } },
            product: { connect: { id: productId } },
            quantity,
            unitPrice,
            totalPrice,
          } as any,
        });
      }

      const items = await tx.orderItem.findMany({
        where: { orderId, companyId } as any,
        select: { totalPrice: true },
      });

      const total = money(
        items.reduce((acc: number, it: any) => acc + money(it.totalPrice), 0),
      );

      await tx.order.updateMany({
        where: { id: orderId, companyId } as any,
        data: { totalAmount: total } as any,
      });
    });
  });

  redirect(getRedirectTo(formData));
}

/* ---------------------------------------------------------
 * CONTA DO CLIENTE
 * ---------------------------------------------------------*/
export async function finalizeClientOpenOrders(
  formData: FormData,
): Promise<void> {
  const clientId = formData.get("clientId") as string | null;
  const barberId = (formData.get("barberId") as string | null) || null;

  if (!clientId) {
    throw new Error("clientId é obrigatório para finalizar a conta.");
  }

  const admin = (await requireAdminPermission("canAccessCheckout")) as any;
  const companyId = requireCompanyIdFromAdmin(admin);

  const activeUnitId = await resolveUnitScope({
    unitId: admin?.unitId ?? null,
    canSeeAllUnits: !!admin?.canSeeAllUnits,
  });

  await withRevalidate(async () => {
    const [serviceOrders, productOrders] = await Promise.all([
      prisma.order.findMany({
        where: {
          companyId,
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
          companyId: true,
          items: { select: { id: true, serviceId: true, productId: true } },
        },
      }),

      prisma.order.findMany({
        where: {
          companyId,
          clientId,
          status: "PENDING_CHECKIN",
          ...(activeUnitId ? { unitId: activeUnitId } : {}),
          items: { some: { productId: { not: null } } },
        } as any,
        include: {
          items: { include: { product: true } },
        },
      }),
    ]);

    if (serviceOrders.length === 0 && productOrders.length === 0) return;

    if (productOrders.length > 0 && !barberId) {
      throw new Error(
        "Selecione o barbeiro responsável para finalizar a venda de produtos.",
      );
    }

    if (productOrders.length > 0) {
      const unitIds = Array.from(
        new Set(productOrders.map((o) => o.unitId).filter(Boolean)),
      ) as string[];

      if (unitIds.length === 0)
        throw new Error("Pedidos de produto sem unidade vinculada.");

      if (unitIds.length > 1) {
        throw new Error(
          "Esta conta possui produtos de mais de uma unidade. Filtre por unidade e finalize separadamente.",
        );
      }

      const orderUnitId = unitIds[0];

      if (activeUnitId && orderUnitId !== activeUnitId) {
        throw new Error("Esta conta não pertence à unidade selecionada.");
      }

      const barberOk = await prisma.barber.findFirst({
        where: {
          companyId,
          id: barberId!,
          isActive: true,
          units: { some: { unitId: orderUnitId, isActive: true } },
        } as any,
        select: { id: true },
      });

      if (!barberOk) {
        throw new Error(
          "O profissional selecionado não pertence à unidade deste(s) pedido(s) de produto.",
        );
      }
    }

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
      // -------- serviços --------
      for (const order of serviceOrders) {
        assertOrderInCompany({ companyId: order.companyId }, companyId);
        assertOrderInActiveUnit({ unitId: order.unitId ?? null }, activeUnitId);

        if (order.status !== "PENDING") continue;

        const fresh = await tx.order.findFirst({
          where: { id: order.id, companyId } as any,
          select: { id: true, status: true },
        });

        if (!fresh || fresh.status !== "PENDING") continue;

        const full = await tx.order.findFirst({
          where: { id: order.id, companyId } as any,
          include: {
            items: {
              include: {
                service: { select: { price: true, barberPercentage: true } },
              },
            },
            appointment: {
              select: {
                id: true,
                status: true,
                service: { select: { barberPercentage: true } },
              },
            },
          },
        });

        if (!full) continue;

        await tx.order.updateMany({
          where: { id: order.id, companyId } as any,
          data: { status: "COMPLETED" },
        });

        if (full.appointment?.id) {
          const serviceItems = (full.items ?? []).filter(
            (it: any) => it.serviceId != null,
          );

          const serviceSubtotal = calcServiceSubtotal(
            serviceItems.map((it: any) => ({
              quantity: it.quantity,
              unitPrice: it.unitPrice ?? null,
              totalPrice: it.totalPrice ?? null,
              service: it.service ?? null,
            })),
          );

          const pct =
            toNumberDecimal(full.appointment.service?.barberPercentage) || 0;

          const earning = calcCommission(serviceSubtotal, pct);

          // ✅ Decimal-safe
          await tx.appointment.updateMany({
            where: {
              id: full.appointment.id,
              companyId,
              status: "PENDING",
              ...(activeUnitId ? { unitId: activeUnitId } : {}),
            } as any,
            data: {
              status: "DONE",
              concludedByRole: "ADMIN",
              servicePriceAtTheTime: new Prisma.Decimal(serviceSubtotal),
              barberPercentageAtTheTime: new Prisma.Decimal(pct),
              barberEarningValue: new Prisma.Decimal(earning),
            } as any,
          });
        }
      }

      // -------- produtos --------
      for (const order of productOrders as any[]) {
        assertOrderInCompany({ companyId: order.companyId }, companyId);
        assertOrderInActiveUnit({ unitId: order.unitId ?? null }, activeUnitId);

        if (order.status !== "PENDING_CHECKIN") continue;

        if (!order.unitId) {
          throw new Error("Pedido de produto sem unidade vinculada.");
        }

        const fresh = await tx.order.findFirst({
          where: { id: order.id, companyId } as any,
          select: { id: true, status: true },
        });

        if (!fresh || fresh.status !== "PENDING_CHECKIN") continue;

        const barberOk = await tx.barber.findFirst({
          where: {
            companyId,
            id: barberId!,
            isActive: true,
            units: { some: { unitId: order.unitId, isActive: true } },
          } as any,
          select: { id: true },
        });

        if (!barberOk) {
          throw new Error(
            "O profissional selecionado não pertence à unidade deste(s) pedido(s) de produto.",
          );
        }

        // ✅ REPRECIFICA ANTES DE DAR BAIXA E REGISTRAR VENDA
        const repriced = await repriceProductOrderInTx({
          tx,
          companyId,
          order,
          clientId,
          timeZone: "America/Sao_Paulo",
        });

        const byProductId = new Map<
          string,
          { unitPrice: number; totalPrice: number; quantity: number }
        >();
        for (const it of repriced.items) {
          byProductId.set(String(it.productId), {
            unitPrice: it.unitPrice,
            totalPrice: it.totalPrice,
            quantity: it.quantity,
          });
        }

        const productItems = (order.items ?? []).filter(
          (item: any) => item.productId != null,
        );

        for (const item of productItems) {
          if (!item.productId || !item.product) continue;

          const priced = byProductId.get(String(item.productId));
          const qty =
            priced?.quantity ?? Math.max(1, Number(item.quantity ?? 1));

          assertEnoughStock(
            {
              name: item.product.name,
              stockQuantity: item.product.stockQuantity,
            },
            qty,
          );

          await tx.product.updateMany({
            where: { id: item.productId, companyId } as any,
            data: { stockQuantity: item.product.stockQuantity - qty },
          });

          const saleUnitPrice = priced?.unitPrice ?? money(item.unitPrice);
          const saleTotalPrice = priced?.totalPrice ?? money(item.totalPrice);

          await tx.productSale.create({
            data: {
              company: { connect: { id: companyId } },
              product: { connect: { id: item.productId } },
              barber: { connect: { id: barberId! } },
              unit: { connect: { id: order.unitId } },
              quantity: qty,
              unitPrice: new Prisma.Decimal(saleUnitPrice),
              totalPrice: new Prisma.Decimal(saleTotalPrice),
            } as any,
          });
        }

        await tx.order.updateMany({
          where: { id: order.id, companyId } as any,
          data: {
            status: "COMPLETED",
            barberId: barberId!,
            totalAmount: new Prisma.Decimal(repriced.totalAmount),
          } as any,
        });
      }
    });
  });

  redirect(getRedirectTo(formData));
}

export async function cancelClientOpenOrders(
  formData: FormData,
): Promise<void> {
  const clientId = formData.get("clientId") as string | null;
  if (!clientId) {
    throw new Error("clientId é obrigatório para cancelar a conta.");
  }

  const admin = (await requireAdminPermission("canAccessCheckout")) as any;
  const companyId = requireCompanyIdFromAdmin(admin);

  const activeUnitId = await resolveUnitScope({
    unitId: admin?.unitId ?? null,
    canSeeAllUnits: !!admin?.canSeeAllUnits,
  });

  await withRevalidate(async () => {
    await prisma.order.updateMany({
      where: {
        companyId,
        status: { in: ["PENDING", "PENDING_CHECKIN"] },
        ...(activeUnitId ? { unitId: activeUnitId } : {}),
        OR: [{ clientId }, { appointment: { clientId } }],
      } as any,
      data: { status: "CANCELED" },
    });
  });

  redirect(getRedirectTo(formData));
}

/* ---------------------------------------------------------
 * PRODUTOS – fluxo antigo
 * ---------------------------------------------------------*/
export async function finalizeProductOrder(formData: FormData): Promise<void> {
  const orderId = formData.get("orderId") as string | null;
  const barberId = formData.get("barberId") as string | null;

  if (!orderId || !barberId) {
    throw new Error("Dados inválidos para finalizar pedido de produto.");
  }

  const admin = (await requireAdminPermission("canAccessCheckout")) as any;
  const companyId = requireCompanyIdFromAdmin(admin);

  const activeUnitId = await resolveUnitScope({
    unitId: admin?.unitId ?? null,
    canSeeAllUnits: !!admin?.canSeeAllUnits,
  });

  await withRevalidate(async () => {
    const order = await prisma.order.findFirst({
      where: { id: orderId, companyId } as any,
      include: { items: { include: { product: true } } },
    });

    if (!order) throw new Error("Pedido não encontrado.");

    assertOrderInCompany({ companyId: (order as any).companyId }, companyId);
    assertOrderInActiveUnit(
      { unitId: (order as any).unitId ?? null },
      activeUnitId,
    );

    if ((order as any).status !== "PENDING_CHECKIN") return;

    if (!(order as any).items.some((it: any) => it.productId != null)) {
      throw new Error("Este pedido não possui itens de produto.");
    }

    const productItems = (order as any).items.filter(
      (item: any) => item.productId != null,
    );

    await prisma.$transaction(async (tx) => {
      if (!(order as any).unitId) {
        throw new Error("Pedido de produto sem unidade vinculada.");
      }

      const fresh = await tx.order.findFirst({
        where: { id: orderId, companyId } as any,
        select: { status: true, clientId: true },
      });

      if (!fresh || (fresh as any).status !== "PENDING_CHECKIN") return;

      const barberOk = await tx.barber.findFirst({
        where: {
          companyId,
          id: barberId,
          isActive: true,
          units: { some: { unitId: (order as any).unitId, isActive: true } },
        } as any,
        select: { id: true },
      });

      if (!barberOk) {
        throw new Error(
          "O profissional selecionado não pertence à unidade deste pedido.",
        );
      }

      const repriced = await repriceProductOrderInTx({
        tx,
        companyId,
        order,
        clientId: String(
          (fresh as any).clientId ?? (order as any).clientId ?? "",
        ),
        timeZone: "America/Sao_Paulo",
      });

      const byProductId = new Map<
        string,
        { unitPrice: number; totalPrice: number; quantity: number }
      >();
      for (const it of repriced.items) {
        byProductId.set(String(it.productId), {
          unitPrice: it.unitPrice,
          totalPrice: it.totalPrice,
          quantity: it.quantity,
        });
      }

      for (const item of productItems) {
        if (!item.productId || !item.product) continue;

        const priced = byProductId.get(String(item.productId));
        const qty = priced?.quantity ?? Math.max(1, Number(item.quantity ?? 1));

        assertEnoughStock(
          {
            name: item.product.name,
            stockQuantity: item.product.stockQuantity,
          },
          qty,
        );

        await tx.product.updateMany({
          where: { id: item.productId, companyId } as any,
          data: { stockQuantity: item.product.stockQuantity - qty },
        });

        const saleUnitPrice = priced?.unitPrice ?? money(item.unitPrice);
        const saleTotalPrice = priced?.totalPrice ?? money(item.totalPrice);

        await tx.productSale.create({
          data: {
            company: { connect: { id: companyId } },
            product: { connect: { id: item.productId } },
            barber: { connect: { id: barberId } },
            unit: { connect: { id: (order as any).unitId } },
            quantity: qty,
            unitPrice: new Prisma.Decimal(saleUnitPrice),
            totalPrice: new Prisma.Decimal(saleTotalPrice),
          } as any,
        });
      }

      await tx.order.updateMany({
        where: { id: orderId, companyId } as any,
        data: {
          status: "COMPLETED",
          barberId,
          totalAmount: new Prisma.Decimal(repriced.totalAmount),
        } as any,
      });
    });
  });

  redirect(getRedirectTo(formData));
}

export async function cancelProductOrder(formData: FormData): Promise<void> {
  const orderId = formData.get("orderId") as string | null;
  if (!orderId)
    throw new Error("Dados inválidos para cancelar pedido de produto.");

  const admin = (await requireAdminPermission("canAccessCheckout")) as any;
  const companyId = requireCompanyIdFromAdmin(admin);

  const activeUnitId = await resolveUnitScope({
    unitId: admin?.unitId ?? null,
    canSeeAllUnits: !!admin?.canSeeAllUnits,
  });

  await withRevalidate(async () => {
    const order = await prisma.order.findFirst({
      where: { id: orderId, companyId } as any,
      select: {
        id: true,
        status: true,
        unitId: true,
        companyId: true,
        items: { select: { productId: true } },
      },
    });

    if (!order) throw new Error("Pedido não encontrado.");

    assertOrderInCompany({ companyId: (order as any).companyId }, companyId);
    assertOrderInActiveUnit(
      { unitId: (order as any).unitId ?? null },
      activeUnitId,
    );

    if ((order as any).status !== "PENDING_CHECKIN") return;

    if (!((order as any).items ?? []).some((it: any) => it.productId != null)) {
      throw new Error("Este pedido não possui itens de produto.");
    }

    await prisma.order.updateMany({
      where: { id: orderId, companyId } as any,
      data: { status: "CANCELED" },
    });
  });

  redirect(getRedirectTo(formData));
}

/* ---------------------------------------------------------
 * SERVIÇOS – (PENDING → COMPLETED / CANCELED)
 * ---------------------------------------------------------*/
export async function finalizeServiceOrder(formData: FormData): Promise<void> {
  const orderId = formData.get("orderId") as string | null;
  if (!orderId)
    throw new Error("Dados inválidos para finalizar checkout de serviço.");

  const admin = (await requireAdminPermission("canAccessCheckout")) as any;
  const companyId = requireCompanyIdFromAdmin(admin);

  const activeUnitId = await resolveUnitScope({
    unitId: admin?.unitId ?? null,
    canSeeAllUnits: !!admin?.canSeeAllUnits,
  });

  await withRevalidate(async () => {
    const order = await prisma.order.findFirst({
      where: { id: orderId, companyId } as any,
      select: {
        id: true,
        status: true,
        appointmentId: true,
        unitId: true,
        companyId: true,
        items: { select: { serviceId: true } },
      },
    });

    if (!order) throw new Error("Pedido não encontrado.");

    assertOrderInCompany({ companyId: (order as any).companyId }, companyId);
    assertOrderInActiveUnit(
      { unitId: (order as any).unitId ?? null },
      activeUnitId,
    );

    if ((order as any).status !== "PENDING") return;

    if (!((order as any).items ?? []).some((it: any) => it.serviceId != null)) {
      throw new Error("Este pedido não possui itens de serviço.");
    }

    await prisma.$transaction(async (tx) => {
      const fresh = await tx.order.findFirst({
        where: { id: orderId, companyId } as any,
        select: { status: true },
      });

      if (!fresh || (fresh as any).status !== "PENDING") return;

      const full = await tx.order.findFirst({
        where: { id: orderId, companyId } as any,
        include: {
          items: {
            include: {
              service: { select: { price: true, barberPercentage: true } },
            },
          },
          appointment: {
            select: {
              id: true,
              status: true,
              service: { select: { barberPercentage: true } },
            },
          },
        },
      });

      if (!full) return;

      await tx.order.updateMany({
        where: { id: orderId, companyId } as any,
        data: { status: "COMPLETED" },
      });

      if ((full as any).appointment?.id) {
        const serviceItems = ((full as any).items ?? []).filter(
          (it: any) => it.serviceId != null,
        );

        const serviceSubtotal = calcServiceSubtotal(
          serviceItems.map((it: any) => ({
            quantity: it.quantity,
            unitPrice: it.unitPrice ?? null,
            totalPrice: it.totalPrice ?? null,
            service: it.service ?? null,
          })),
        );

        const pct =
          toNumberDecimal(
            (full as any).appointment.service?.barberPercentage,
          ) || 0;

        const earning = calcCommission(serviceSubtotal, pct);

        await tx.appointment.updateMany({
          where: {
            id: (full as any).appointment.id,
            companyId,
            status: "PENDING",
            ...(activeUnitId ? { unitId: activeUnitId } : {}),
          } as any,
          data: {
            status: "DONE",
            concludedByRole: "ADMIN",
            servicePriceAtTheTime: new Prisma.Decimal(serviceSubtotal),
            barberPercentageAtTheTime: new Prisma.Decimal(pct),
            barberEarningValue: new Prisma.Decimal(earning),
          } as any,
        });
      }
    });
  });

  redirect(getRedirectTo(formData));
}

export async function cancelServiceOrder(formData: FormData): Promise<void> {
  const orderId = formData.get("orderId") as string | null;
  if (!orderId)
    throw new Error("Dados inválidos para cancelar checkout de serviço.");

  const admin = (await requireAdminPermission("canAccessCheckout")) as any;
  const companyId = requireCompanyIdFromAdmin(admin);

  const activeUnitId = await resolveUnitScope({
    unitId: admin?.unitId ?? null,
    canSeeAllUnits: !!admin?.canSeeAllUnits,
  });

  await withRevalidate(async () => {
    const order = await prisma.order.findFirst({
      where: { id: orderId, companyId } as any,
      select: {
        id: true,
        status: true,
        appointmentId: true,
        unitId: true,
        companyId: true,
        items: { select: { serviceId: true } },
      },
    });

    if (!order) throw new Error("Pedido não encontrado.");

    assertOrderInCompany({ companyId: (order as any).companyId }, companyId);
    assertOrderInActiveUnit(
      { unitId: (order as any).unitId ?? null },
      activeUnitId,
    );

    if ((order as any).status !== "PENDING") return;

    if (!((order as any).items ?? []).some((it: any) => it.serviceId != null)) {
      throw new Error("Este pedido não possui itens de serviço.");
    }

    await prisma.$transaction(async (tx) => {
      const fresh = await tx.order.findFirst({
        where: { id: orderId, companyId } as any,
        select: { status: true },
      });

      if (!fresh || (fresh as any).status !== "PENDING") return;

      await tx.order.updateMany({
        where: { id: orderId, companyId } as any,
        data: { status: "CANCELED" },
      });

      if ((order as any).appointmentId) {
        await tx.appointment.updateMany({
          where: {
            id: (order as any).appointmentId,
            companyId,
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
