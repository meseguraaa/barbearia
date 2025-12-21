// src/app/api/mobile/orders/route.ts
import { NextResponse } from "next/server";
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

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/**
 * POST /api/mobile/orders
 *
 * Body:
 * - productId: string
 * - quantity: number (default 1)
 *
 * Regras (igual web):
 * - NÃO baixa estoque
 * - NÃO registra ProductSale
 * - Cria Order com status PENDING_CHECKIN
 * - reservedUntil baseado no pickupDeadlineDays
 *
 * Regra adicional do app:
 * - Se reservar o mesmo produto 2x -> incrementa quantidade
 *
 * Response:
 * - { ok: true, orderId, reservedUntil }
 */
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
      const product = await tx.product.findFirst({
        where: { id: productId, isActive: true },
        select: {
          id: true,
          price: true, // Decimal
          stockQuantity: true,
          pickupDeadlineDays: true,
          unitId: true,
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

      const unitPrice = product.price;
      const itemTotal = unitPrice.mul(quantity);

      const now = new Date();

      // ✅ reaproveita pedido pendente do cliente (mesma unidade) se existir e não expirado
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

      // ✅ se não existe pedido pendente: cria
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

      // ✅ já tem o item: incrementa (opção A)
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

      // ✅ pedido existe, mas ainda não tem esse produto: cria item
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

    // negócio / validações
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

/**
 * GET /api/mobile/orders
 *
 * Query:
 * - status: optional (ex: PENDING_CHECKIN, PAID, CANCELED...)  [match exato]
 * - cursor: orderId
 * - limit: number (default 20, max 50)
 *
 * Response:
 * - { ok, orders, items, count, nextCursor }
 */
export async function GET(req: Request) {
  const headers = corsHeaders();

  try {
    const auth = await requireMobileAuth(req);

    // "Meus pedidos" é visão de CLIENT
    if (auth.role !== "CLIENT") {
      return NextResponse.json(
        { error: "forbidden" },
        { status: 403, headers },
      );
    }

    const url = new URL(req.url);

    const status = (url.searchParams.get("status") ?? "").trim();
    const cursor = (url.searchParams.get("cursor") ?? "").trim();
    const limit = parseLimit(url.searchParams.get("limit"));

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

    const orders = page.map((o) => ({
      id: o.id,
      status: o.status,
      createdAt: o.createdAt,
      reservedUntil: o.reservedUntil,
      totalAmount: Number(o.totalAmount),
      unitId: o.unitId,
      unitName: o.unit?.name ?? "—",
      items: o.items.map((it) => ({
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
            }
          : null,
      })),
    }));

    const nextCursor = hasMore ? (orders[orders.length - 1]?.id ?? null) : null;

    return NextResponse.json(
      {
        ok: true,
        orders,
        items: orders, // alias
        count: orders.length,
        nextCursor,
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

    console.error("[mobile orders] error:", e);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500, headers },
    );
  }
}
