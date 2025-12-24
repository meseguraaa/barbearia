// src/app/api/mobile/orders/route.ts
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyAppJwt } from "@/lib/app-jwt";

type Role = "CLIENT" | "BARBER" | "ADMIN";

type MobileTokenPayload = {
  sub: string;
  role: Role;
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

async function requireMobileAuth(req: Request): Promise<MobileTokenPayload> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new Error("missing_token");
  return await verifyAppJwt(token);
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
 * 🔥 MOTOR DE PREÇO (Mobile) - mesmo do /products
 * ---------------------------------------------------------*/
type CustomerLevel = "BRONZE" | "PRATA" | "OURO" | "DIAMANTE";

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

async function resolveProductUnitPrice(args: {
  productId: string;
  clientId: string | null;
  effectiveLevel?: CustomerLevel;
  timeZone?: string;
  now?: Date;
}) {
  const timeZone = args.timeZone ?? "America/Sao_Paulo";
  const now = args.now ?? new Date();
  const effectiveLevel: CustomerLevel = args.effectiveLevel ?? "BRONZE";

  const [product, client] = await Promise.all([
    prisma.product.findUnique({
      where: { id: args.productId },
      select: {
        id: true,
        price: true,
        unitId: true,
        birthdayBenefitEnabled: true,
        birthdayPriceLevel: true,
        prices: { select: { level: true, price: true } },
      } as any,
    }),
    args.clientId
      ? prisma.user.findUnique({
          where: { id: args.clientId },
          select: { id: true, birthday: true },
        })
      : Promise.resolve(null),
  ]);

  if (!product) throw new Error("Produto não encontrado.");

  const rows = Array.isArray((product as any).prices)
    ? (product as any).prices
    : [];

  const priceByLevel = new Map<CustomerLevel, number>();
  for (const row of rows as any[]) {
    priceByLevel.set(row.level as CustomerLevel, Number(row.price));
  }

  const baseBronze = priceByLevel.get("BRONZE") ?? Number(product.price);

  function pickPrice(level: CustomerLevel) {
    for (const l of LEVEL_FALLBACK[level]) {
      const found = priceByLevel.get(l);
      if (typeof found === "number" && Number.isFinite(found)) {
        return { level: l, price: found };
      }
    }
    return { level: "BRONZE" as CustomerLevel, price: baseBronze };
  }

  let inBirthdayWindow = false;

  if (client?.birthday && (product as any).birthdayBenefitEnabled) {
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

  if (inBirthdayWindow && (product as any).birthdayBenefitEnabled) {
    const chosen = (((product as any)
      .birthdayPriceLevel as CustomerLevel | null) ??
      "DIAMANTE") as CustomerLevel;

    const picked = pickPrice(chosen);

    return {
      unitId: product.unitId as string,
      basePrice: baseBronze,
      finalPrice: picked.price,
      appliedLevel: picked.level,
      appliedBecause: "BIRTHDAY" as const,
      inBirthdayWindow: true,
    };
  }

  const picked = pickPrice(effectiveLevel);

  return {
    unitId: product.unitId as string,
    basePrice: baseBronze,
    finalPrice: picked.price,
    appliedLevel: picked.level,
    appliedBecause:
      picked.level === "BRONZE" ? ("BASE" as const) : ("LEVEL" as const),
    inBirthdayWindow: false,
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: Request) {
  const headers = corsHeaders();

  try {
    const auth = await requireMobileAuth(req);

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
      const customerLevel: CustomerLevel = "BRONZE";

      const pricing = await resolveProductUnitPrice({
        productId,
        clientId,
        effectiveLevel: customerLevel,
        timeZone: "America/Sao_Paulo",
      });

      const product = await tx.product.findFirst({
        where: { id: productId, isActive: true },
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
            clientId: auth.sub,
            appointmentId: null,
            barberId: null,
            status: "PENDING_CHECKIN",
            reservedUntil,
            totalAmount: itemTotal,
            unitId: product.unitId,
            items: {
              create: [
                {
                  productId: product.id,
                  quantity,
                  unitPrice,
                  totalPrice: itemTotal,
                },
              ],
            },
          },
          select: { id: true, reservedUntil: true },
        });

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

        await tx.orderItem.update({
          where: { id: existingItem.id },
          data: {
            quantity: newQty,
            unitPrice,
            totalPrice: newTotal,
          },
        });

        await tx.order.update({
          where: { id: existingOrder.id },
          data: {
            reservedUntil: nextReservedUntil,
            totalAmount: existingOrder.totalAmount.add(delta),
          },
          select: { id: true },
        });

        return { orderId: existingOrder.id, reservedUntil: nextReservedUntil };
      }

      await tx.orderItem.create({
        data: {
          orderId: existingOrder.id,
          productId: product.id,
          quantity,
          unitPrice,
          totalPrice: itemTotal,
        },
      });

      await tx.order.update({
        where: { id: existingOrder.id },
        data: {
          reservedUntil: nextReservedUntil,
          totalAmount: existingOrder.totalAmount.add(itemTotal),
        },
        select: { id: true },
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

    if (
      msg.includes("Invalid token") ||
      msg.includes("JWT") ||
      msg.includes("token")
    ) {
      return NextResponse.json(
        { error: "invalid_token" },
        { status: 401, headers },
      );
    }

    if (
      msg.includes("Produto não encontrado") ||
      msg.includes("Quantidade indisponível") ||
      msg.includes("Produto sem unidade")
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
              },
            },
          },
        },
      },
    });

    const hasMore = dbOrders.length > limit;
    const page = hasMore ? dbOrders.slice(0, limit) : dbOrders;

    const customerLevel: CustomerLevel = "BRONZE";
    const clientId = auth.sub;

    const orders = await Promise.all(
      page.map(async (o) => {
        const enrichedItems = await Promise.all(
          o.items.map(async (it) => {
            if (!it.productId) {
              return {
                id: it.id,
                productId: it.productId,
                quantity: it.quantity,
                unitPrice: Number(it.unitPrice),
                totalPrice: Number(it.totalPrice),
                product: null,
              };
            }

            const pricing = await resolveProductUnitPrice({
              productId: it.productId,
              clientId,
              effectiveLevel: customerLevel,
              timeZone: "America/Sao_Paulo",
            });

            const basePrice = Number(pricing.basePrice);
            const finalPrice = Number(pricing.finalPrice);
            const hasDiscount =
              Number.isFinite(basePrice) &&
              Number.isFinite(finalPrice) &&
              finalPrice < basePrice;

            const badge =
              pricing.appliedBecause === "BIRTHDAY"
                ? { type: "BIRTHDAY" as const, label: "🎂 Aniversário" }
                : pricing.appliedBecause === "LEVEL"
                  ? { type: "LEVEL" as const, label: "⭐ Oferta do seu nível" }
                  : null;

            return {
              id: it.id,
              productId: it.productId,
              quantity: it.quantity,
              unitPrice: Number(it.unitPrice),
              totalPrice: Number(it.totalPrice),
              product: it.product
                ? {
                    id: it.product.id,
                    name: it.product.name,
                    imageUrl: it.product.imageUrl ?? null,
                    category: it.product.category ?? null,
                    basePrice,
                    finalPrice,
                    hasDiscount,
                    badge,
                  }
                : null,
            };
          }),
        );

        return {
          id: o.id,
          status: o.status,
          createdAt: o.createdAt,
          reservedUntil: o.reservedUntil,
          totalAmount: Number(o.totalAmount),
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

    if (
      msg.includes("Invalid token") ||
      msg.includes("JWT") ||
      msg.includes("token")
    ) {
      return NextResponse.json(
        { error: "invalid_token" },
        { status: 401, headers },
      );
    }

    console.error("[mobile orders] error:", e);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500, headers },
    );
  }
}
