// src/app/api/mobile/orders/product-sale/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAppJwt } from "@/lib/app-jwt";
import { z } from "zod";

type Role = "CLIENT" | "BARBER" | "ADMIN";

type MobileTokenPayload = {
  sub: string;
  role: Role;
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

async function requireMobileAuth(req: Request): Promise<MobileTokenPayload> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new Error("missing_token");
  return await verifyAppJwt(token);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

const bodySchema = z.object({
  productId: z.string().min(1, "productId obrigatório"),
  quantity: z.number().int().min(1, "quantity deve ser >= 1"),
});

/**
 * POST /api/mobile/orders/product-sale
 *
 * Body:
 * - productId: string
 * - quantity: number
 *
 * Regras:
 * - exige auth (CLIENT)
 * - valida produto ativo e estoque suficiente
 * - NÃO baixa estoque
 * - cria Order PENDING_CHECKIN com reservedUntil (pickupDeadlineDays)
 */
export async function POST(req: Request) {
  const headers = corsHeaders();

  try {
    const auth = await requireMobileAuth(req);

    // Reserva (intenção de compra) faz sentido para CLIENT
    if (auth.role !== "CLIENT") {
      return NextResponse.json(
        { error: "forbidden" },
        { status: 403, headers },
      );
    }

    let json: unknown = null;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json(
        { error: "invalid_json" },
        { status: 400, headers },
      );
    }

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "invalid_body" },
        { status: 400, headers },
      );
    }

    const { productId, quantity } = parsed.data;
    const clientId = auth.sub;

    const result = await prisma.$transaction(async (tx) => {
      // produto ativo + dados essenciais
      const product = await tx.product.findFirst({
        where: { id: productId, isActive: true },
        select: {
          id: true,
          stockQuantity: true,
          price: true, // Decimal
          pickupDeadlineDays: true,
          unitId: true,
        },
      });

      if (!product) {
        return { ok: false as const, status: 404, error: "product_not_found" };
      }

      if (!product.unitId) {
        return {
          ok: false as const,
          status: 400,
          error: "product_missing_unit",
        };
      }

      if (product.stockQuantity < quantity) {
        return { ok: false as const, status: 400, error: "out_of_stock" };
      }

      // prazo de retirada (dias)
      const deadlineDays =
        typeof product.pickupDeadlineDays === "number" &&
        Number.isFinite(product.pickupDeadlineDays) &&
        product.pickupDeadlineDays > 0
          ? product.pickupDeadlineDays
          : 2;

      const reservedUntil = new Date();
      reservedUntil.setDate(reservedUntil.getDate() + deadlineDays);

      const unitPrice = product.price; // Decimal
      const totalPrice = unitPrice.mul(quantity); // Decimal

      const order = await tx.order.create({
        data: {
          clientId,
          appointmentId: null,
          barberId: null,
          status: "PENDING_CHECKIN",
          reservedUntil,
          totalAmount: totalPrice,
          unitId: product.unitId,
          items: {
            create: [
              {
                productId: product.id,
                quantity,
                unitPrice,
                totalPrice,
              },
            ],
          },
        },
        select: { id: true, reservedUntil: true },
      });

      return {
        ok: true as const,
        orderId: order.id,
        reservedUntil: order.reservedUntil,
      };
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status, headers },
      );
    }

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

    console.error("[mobile product-sale] error:", e);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500, headers },
    );
  }
}
