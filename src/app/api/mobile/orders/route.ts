// src/app/api/mobile/orders/route.ts
import { NextResponse } from "next/server";
import { Prisma, CustomerLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAppJwt } from "@/lib/app-jwt";

type Role = "CLIENT" | "BARBER" | "ADMIN";

type MobileTokenPayload = {
  sub: string;
  role: Role;
  companyId: string; // ✅ multi-tenant obrigatório
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-company-id",
  };
}

// ✅ pega header case-insensitive
function getHeaderCI(req: Request, key: string): string | null {
  const target = key.toLowerCase();
  for (const [k, v] of req.headers.entries()) {
    if (k.toLowerCase() === target) {
      const s = String(v ?? "").trim();
      return s.length ? s : null;
    }
  }
  return null;
}

async function requireMobileAuth(req: Request): Promise<MobileTokenPayload> {
  // ✅ usar case-insensitive também no authorization (não muda comportamento)
  const auth = getHeaderCI(req, "authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new Error("missing_token");

  const payload = await verifyAppJwt(token);

  const sub =
    typeof (payload as any)?.sub === "string"
      ? String((payload as any).sub).trim()
      : "";

  if (!sub) throw new Error("invalid_token");

  // ✅ 1) tenta companyId do JWT
  let companyId =
    typeof (payload as any)?.companyId === "string"
      ? String((payload as any).companyId).trim()
      : "";

  // ✅ 2) fallback: x-company-id do header (o app injeta)
  if (!companyId) {
    const h = getHeaderCI(req, "x-company-id");
    if (h) companyId = h;
  }

  if (!companyId) throw new Error("missing_company_id");

  // ✅ 3) valida membership (anti-spoof)
  const membership = await prisma.companyMember.findFirst({
    where: { userId: sub, companyId, isActive: true },
    select: { id: true },
  });

  if (!membership) throw new Error("forbidden_company");

  return { ...(payload as any), sub, companyId } as MobileTokenPayload;
}

function parseLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 20;
  if (n <= 0) return 20;
  return Math.min(50, Math.floor(n));
}

function parseQuantity(v: any): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  const q = Math.floor(n);
  return q >= 1 ? q : 1;
}

/* ---------------------------------------------------------
 * 🔥 MOTOR DE PREÇO (Mobile) - DESCONTO (%)
 * (mesmo padrão do /products)
 * ---------------------------------------------------------*/

const LEVEL_FALLBACK: Record<CustomerLevel, CustomerLevel[]> = {
  DIAMANTE: ["DIAMANTE", "OURO", "PRATA", "BRONZE"],
  OURO: ["OURO", "PRATA", "BRONZE"],
  PRATA: ["PRATA", "BRONZE"],
  BRONZE: ["BRONZE"],
};

function getDatePartsInTz(date: Date, timeZone: string) {
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

// âncora diária (UTC) pra comparar por dia dentro do TZ
function tzMidnightUtc(year: number, month: number, day: number) {
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0",
  )}-${String(day).padStart(2, "0")}T00:00:00Z`;
  return new Date(iso);
}

function addDays(date: Date, days: number) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function isWithinInclusive(date: Date, start: Date, end: Date) {
  const t = date.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function coerceCustomerLevel(value: unknown): CustomerLevel | null {
  return value === "BRONZE" ||
    value === "PRATA" ||
    value === "OURO" ||
    value === "DIAMANTE"
    ? (value as CustomerLevel)
    : null;
}

function clampPct(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.floor(n)));
}

function roundMoney(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function calcFinalPrice(basePrice: number, discountPct: number) {
  const pct = clampPct(discountPct);
  const base = Number.isFinite(basePrice) ? basePrice : 0;
  const final = base * (1 - pct / 100);
  return roundMoney(final);
}

// ✅ nível real do cliente na unidade (customerLevelState)
async function getCustomerLevelForUnit(args: {
  companyId: string;
  userId: string;
  unitId: string | null;
}): Promise<CustomerLevel> {
  if (!args.unitId) return "BRONZE";

  const s = await prisma.customerLevelState.findFirst({
    where: {
      companyId: args.companyId,
      userId: args.userId,
      unitId: args.unitId,
    },
    select: { levelCurrent: true },
  });

  const lvl = coerceCustomerLevel(s?.levelCurrent);
  return lvl ?? "BRONZE";
}

async function resolveProductUnitPrice(args: {
  productId: string;
  clientId: string | null;
  effectiveLevel?: CustomerLevel;
  timeZone?: string;
  now?: Date;
  companyId: string; // ✅ tenant scope
}) {
  const timeZone = args.timeZone ?? "America/Sao_Paulo";
  const now = args.now ?? new Date();
  const effectiveLevel: CustomerLevel = args.effectiveLevel ?? "BRONZE";

  const [product, client] = await Promise.all([
    prisma.product.findFirst({
      where: {
        id: args.productId,
        isActive: true,
        companyId: args.companyId,
        unit: { companyId: args.companyId }, // redundância boa
      },
      select: {
        id: true,
        price: true,
        unitId: true,
        birthdayBenefitEnabled: true,
        birthdayPriceLevel: true,
      },
    }),

    // ✅ User não tem companyId no schema -> não filtra por companyId
    args.clientId
      ? prisma.user.findFirst({
          where: { id: args.clientId },
          select: { id: true, birthday: true },
        })
      : Promise.resolve(null),
  ]);

  if (!product) throw new Error("Produto não encontrado.");

  // ✅ descontos do produto por nível (tenant-safe)
  const discountRows = await prisma.productDiscountByLevel.findMany({
    where: {
      productId: product.id,
      companyId: args.companyId,
    },
    select: { level: true, discountPct: true },
  });

  const discountByLevel = new Map<CustomerLevel, number>();
  for (const row of discountRows) {
    const lvl = coerceCustomerLevel(row.level);
    if (!lvl) continue;
    discountByLevel.set(lvl, clampPct(Number(row.discountPct)));
  }

  function pickDiscount(level: CustomerLevel) {
    for (const l of LEVEL_FALLBACK[level]) {
      if (discountByLevel.has(l)) {
        return { level: l, discountPct: discountByLevel.get(l)! };
      }
    }
    return { level: "BRONZE" as CustomerLevel, discountPct: 0 };
  }

  const basePrice = Number(product.price);

  // janela de aniversário: 3 dias antes + dia + 3 dias depois (por dia no TZ)
  let inBirthdayWindow = false;

  if (client?.birthday && product.birthdayBenefitEnabled) {
    const nowParts = getDatePartsInTz(now, timeZone);
    const b = getDatePartsInTz(client.birthday, timeZone);

    const birthdayThisYear = tzMidnightUtc(nowParts.year, b.month, b.day);
    const start = addDays(birthdayThisYear, -3);
    const end = addDays(birthdayThisYear, +3);

    const todayAnchor = tzMidnightUtc(
      nowParts.year,
      nowParts.month,
      nowParts.day,
    );
    inBirthdayWindow = isWithinInclusive(todayAnchor, start, end);
  }

  // ✅ aniversário ganha prioridade quando habilitado
  if (inBirthdayWindow && product.birthdayBenefitEnabled) {
    const chosen = (coerceCustomerLevel(product.birthdayPriceLevel) ??
      ("DIAMANTE" as CustomerLevel)) as CustomerLevel;

    const picked = pickDiscount(chosen);
    const finalPrice = calcFinalPrice(basePrice, picked.discountPct);

    return {
      unitId: product.unitId,
      basePrice,
      finalPrice,
      discountPct: picked.discountPct,
      appliedLevel: picked.level,
      appliedBecause: "BIRTHDAY" as const,
      inBirthdayWindow: true,
    };
  }

  const picked = pickDiscount(effectiveLevel);
  const finalPrice = calcFinalPrice(basePrice, picked.discountPct);

  return {
    unitId: product.unitId,
    basePrice,
    finalPrice,
    discountPct: picked.discountPct,
    appliedLevel: picked.level,
    appliedBecause:
      picked.discountPct > 0 ? ("LEVEL" as const) : ("BASE" as const),
    inBirthdayWindow: false,
  };
}

/* ---------------------------------------------------------
 * ✅ Compat helper: OrderItem pode ou não ter companyId no schema
 * ---------------------------------------------------------*/
async function createOrderItemCompat(
  tx: any,
  data: Record<string, any>,
  companyId: string,
) {
  try {
    return await tx.orderItem.create({
      data: { ...data, companyId },
    });
  } catch {
    return await tx.orderItem.create({ data });
  }
}

async function updateOrderItemCompat(
  tx: any,
  where: Record<string, any>,
  data: Record<string, any>,
) {
  return await tx.orderItem.updateMany({ where, data });
}

/* ---------------------------------------------------------
 * 💸 helpers de moeda/round
 * ---------------------------------------------------------*/
function money(n: number) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

async function safeResolvePricing(
  args: Parameters<typeof resolveProductUnitPrice>[0],
) {
  try {
    return await resolveProductUnitPrice(args);
  } catch {
    return null;
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: Request) {
  const headers = corsHeaders();

  try {
    const auth = await requireMobileAuth(req);
    const companyId = auth.companyId;

    if (auth.role !== "CLIENT") {
      return NextResponse.json(
        { error: "forbidden" },
        { status: 403, headers },
      );
    }

    const body = await req.json().catch(() => ({}));
    const productId = String(body?.productId ?? "").trim();
    const quantity = parseQuantity(body?.quantity);

    if (!productId) {
      return NextResponse.json(
        { error: "invalid_productId" },
        { status: 400, headers },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const clientId = auth.sub;

      // ✅ 1) pega o produto primeiro (precisa de unitId)
      const product = await tx.product.findFirst({
        where: { id: productId, companyId, isActive: true },
        select: {
          id: true,
          stockQuantity: true,
          pickupDeadlineDays: true,
          unitId: true,
        },
      });

      if (!product) throw new Error("Produto não encontrado ou inativo.");
      if (!product.unitId) {
        throw new Error(
          "Produto sem unidade vinculada (unitId). Não é possível criar o pedido.",
        );
      }
      if (product.stockQuantity < quantity) {
        throw new Error("Quantidade indisponível no estoque.");
      }

      // ✅ 2) nível real do cliente naquela unidade
      const customerLevel = await getCustomerLevelForUnit({
        companyId,
        userId: clientId,
        unitId: product.unitId,
      });

      // ✅ 3) calcula preço (desconto % + aniversário)
      const pricing = await resolveProductUnitPrice({
        productId,
        clientId,
        effectiveLevel: customerLevel,
        timeZone: "America/Sao_Paulo",
        companyId,
      });

      // ✅ defesa: unit coerente
      if (
        pricing.unitId &&
        product.unitId &&
        String(pricing.unitId) !== String(product.unitId)
      ) {
        throw new Error("Produto inválido para esta unidade.");
      }

      const deadlineDays =
        typeof product.pickupDeadlineDays === "number" &&
        Number.isFinite(product.pickupDeadlineDays) &&
        product.pickupDeadlineDays > 0
          ? product.pickupDeadlineDays
          : 2;

      const reservedUntil = new Date();
      reservedUntil.setDate(reservedUntil.getDate() + deadlineDays);

      // ✅ Decimal do jeito certo
      const unitPrice = new Prisma.Decimal(pricing.finalPrice);
      const itemTotal = unitPrice.mul(quantity);

      const now = new Date();

      const existingOrder = await tx.order.findFirst({
        where: {
          companyId,
          clientId: auth.sub,
          status: "PENDING_CHECKIN",
          unitId: product.unitId,
          OR: [{ reservedUntil: null }, { reservedUntil: { gt: now } }],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          totalAmount: true,
          reservedUntil: true,
          items: {
            where: { productId: product.id },
            select: { id: true, quantity: true, totalPrice: true },
            take: 1,
          },
        },
      });

      const nextReservedUntil = (() => {
        if (!existingOrder?.reservedUntil) return reservedUntil;
        return existingOrder.reservedUntil > reservedUntil
          ? existingOrder.reservedUntil
          : reservedUntil;
      })();

      if (!existingOrder) {
        const order = await tx.order.create({
          data: {
            companyId,
            clientId: auth.sub,
            appointmentId: null,
            barberId: null,
            status: "PENDING_CHECKIN",
            reservedUntil,
            totalAmount: itemTotal,
            unitId: product.unitId,
          },
          select: { id: true, reservedUntil: true },
        });

        await createOrderItemCompat(
          tx,
          {
            orderId: order.id,
            productId: product.id,
            quantity,
            unitPrice,
            totalPrice: itemTotal,
          },
          companyId,
        );

        return { orderId: order.id, reservedUntil: order.reservedUntil };
      }

      const existingItem = existingOrder.items?.[0] ?? null;

      if (existingItem) {
        const newQty = existingItem.quantity + quantity;

        if (product.stockQuantity < newQty) {
          throw new Error("Quantidade indisponível no estoque.");
        }

        const newTotal = unitPrice.mul(newQty);
        const delta = newTotal.sub(existingItem.totalPrice);

        // ✅ where mais seguro (sem mudar o efeito)
        await updateOrderItemCompat(
          tx,
          { id: existingItem.id, orderId: existingOrder.id, companyId },
          {
            quantity: newQty,
            unitPrice,
            totalPrice: newTotal,
          },
        );

        await tx.order.updateMany({
          where: { id: existingOrder.id, companyId },
          data: {
            reservedUntil: nextReservedUntil,
            totalAmount: existingOrder.totalAmount.add(delta),
          },
        });

        return { orderId: existingOrder.id, reservedUntil: nextReservedUntil };
      }

      await createOrderItemCompat(
        tx,
        {
          orderId: existingOrder.id,
          productId: product.id,
          quantity,
          unitPrice,
          totalPrice: itemTotal,
        },
        companyId,
      );

      await tx.order.updateMany({
        where: { id: existingOrder.id, companyId },
        data: {
          reservedUntil: nextReservedUntil,
          totalAmount: existingOrder.totalAmount.add(itemTotal),
        },
      });

      return { orderId: existingOrder.id, reservedUntil: nextReservedUntil };
    });

    return NextResponse.json(
      {
        ok: true,
        orderId: result.orderId,
        reservedUntil: result.reservedUntil,
      },
      { status: 200, headers },
    );
  } catch (e: any) {
    const msg = String(e?.message ?? "");

    if (msg.includes("missing_token")) {
      return NextResponse.json(
        { error: "missing_token" },
        { status: 401, headers },
      );
    }

    if (msg.includes("missing_company_id")) {
      return NextResponse.json(
        { error: "missing_company_id" },
        { status: 401, headers },
      );
    }

    if (msg.includes("forbidden_company")) {
      return NextResponse.json(
        { error: "forbidden_company" },
        { status: 403, headers },
      );
    }

    if (
      msg.includes("Invalid token") ||
      msg.includes("JWT") ||
      msg.includes("token") ||
      msg.includes("invalid_token")
    ) {
      return NextResponse.json(
        { error: "invalid_token" },
        { status: 401, headers },
      );
    }

    if (
      msg.includes("Produto não encontrado") ||
      msg.includes("Quantidade indisponível") ||
      msg.includes("Produto sem unidade") ||
      msg.includes("Produto inválido")
    ) {
      return NextResponse.json({ error: msg }, { status: 400, headers });
    }

    console.error("[mobile orders POST] error:", e);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500, headers },
    );
  }
}

export async function GET(req: Request) {
  const headers = corsHeaders();

  try {
    const auth = await requireMobileAuth(req);
    const companyId = auth.companyId;

    if (auth.role !== "CLIENT") {
      return NextResponse.json(
        { error: "forbidden" },
        { status: 403, headers },
      );
    }

    const url = new URL(req.url);

    const view = (url.searchParams.get("view") ?? "").trim();
    const statusRaw = (url.searchParams.get("status") ?? "").trim();
    const cursor = (url.searchParams.get("cursor") ?? "").trim();
    const limit = parseLimit(url.searchParams.get("limit"));

    const status =
      statusRaw ||
      (view === "bag"
        ? "PENDING_CHECKIN"
        : view === "history"
          ? "COMPLETED"
          : "");

    const where: any = {
      companyId,
      clientId: auth.sub,
      ...(status ? { status } : {}),
    };

    const dbOrders = await prisma.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        status: true,
        reservedUntil: true,
        totalAmount: true,
        createdAt: true,
        unitId: true,
        unit: { select: { id: true, name: true } },
        items: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
            productId: true,
            product: {
              select: {
                id: true,
                name: true,
                imageUrl: true,
                category: true,
              } as any,
            },
          },
        },
      },
    });

    const hasMore = dbOrders.length > limit;
    const page = hasMore ? dbOrders.slice(0, limit) : dbOrders;

    const clientId = auth.sub;

    const orders = await Promise.all(
      page.map(async (o) => {
        // ✅ nível real por unidade do pedido
        const customerLevel = await getCustomerLevelForUnit({
          companyId,
          userId: clientId,
          unitId: o.unitId ?? null,
        });

        const enrichedItems = await Promise.all(
          (o.items ?? []).map(async (it) => {
            const qty = Math.max(1, Number(it.quantity ?? 1));
            const storedUnit = money(Number(it.unitPrice));
            const storedLine = money(Number(it.totalPrice));

            if (!it.productId) {
              return {
                id: it.id,
                productId: it.productId,
                quantity: qty,
                unitPrice: storedUnit,
                totalPrice: storedLine,
                product: null,
              };
            }

            const pricing = await safeResolvePricing({
              productId: String(it.productId),
              clientId,
              effectiveLevel: customerLevel, // ✅ nível real
              timeZone: "America/Sao_Paulo",
              companyId,
            });

            if (!pricing) {
              return {
                id: it.id,
                productId: it.productId,
                quantity: qty,
                unitPrice: storedUnit,
                totalPrice: storedLine,
                product: it.product
                  ? {
                      id: it.product.id,
                      name: it.product.name,
                      imageUrl: it.product.imageUrl ?? null,
                      category: (it.product as any).category ?? null,
                    }
                  : null,
              };
            }

            const basePrice = money(Number(pricing.basePrice));
            const finalPrice = money(Number(pricing.finalPrice));
            const discountPct = clampPct(Number(pricing.discountPct ?? 0));

            const computedUnitPrice = Number.isFinite(finalPrice)
              ? finalPrice
              : storedUnit;

            const computedTotalPrice = money(computedUnitPrice * qty);

            const hasDiscount =
              Number.isFinite(basePrice) &&
              Number.isFinite(computedUnitPrice) &&
              computedUnitPrice < basePrice;

            // ✅ compat: só BIRTHDAY ou LEVEL
            const badge =
              pricing.appliedBecause === "BIRTHDAY"
                ? { type: "BIRTHDAY" as const, label: "🎂 Aniversário" }
                : hasDiscount
                  ? { type: "LEVEL" as const, label: `${discountPct}% OFF` }
                  : null;

            return {
              id: it.id,
              productId: it.productId,
              quantity: qty,
              unitPrice: computedUnitPrice, // ✅ preço final (desconto)
              totalPrice: computedTotalPrice, // ✅ preço final (desconto)
              product: it.product
                ? {
                    id: it.product.id,
                    name: it.product.name,
                    imageUrl: it.product.imageUrl ?? null,
                    category: (it.product as any).category ?? null,
                    basePrice,
                    finalPrice: computedUnitPrice,
                    hasDiscount,
                    badge,
                  }
                : null,
            };
          }),
        );

        const computedTotalAmount = money(
          enrichedItems.reduce(
            (acc, it) => acc + money((it as any)?.totalPrice),
            0,
          ),
        );

        return {
          id: o.id,
          status: o.status,
          createdAt: o.createdAt,
          reservedUntil: o.reservedUntil,
          totalAmount: computedTotalAmount,
          unitId: o.unitId,
          unitName: o.unit?.name ?? "—",
          items: enrichedItems,
        };
      }),
    );

    const nextCursor = hasMore ? (orders[orders.length - 1]?.id ?? null) : null;

    return NextResponse.json(
      { ok: true, orders, items: orders, count: orders.length, nextCursor },
      { status: 200, headers },
    );
  } catch (e: any) {
    const msg = String(e?.message ?? "");

    if (msg.includes("missing_token")) {
      return NextResponse.json(
        { error: "missing_token" },
        { status: 401, headers },
      );
    }

    if (msg.includes("missing_company_id")) {
      return NextResponse.json(
        { error: "missing_company_id" },
        { status: 401, headers },
      );
    }

    if (msg.includes("forbidden_company")) {
      return NextResponse.json(
        { error: "forbidden_company" },
        { status: 403, headers },
      );
    }

    if (
      msg.includes("Invalid token") ||
      msg.includes("JWT") ||
      msg.includes("token") ||
      msg.includes("invalid_token")
    ) {
      return NextResponse.json(
        { error: "invalid_token" },
        { status: 401, headers },
      );
    }

    console.error("[mobile orders GET] error:", e);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500, headers },
    );
  }
}
