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
    "Access-Control-Allow-Methods": "GET,OPTIONS",
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

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
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
