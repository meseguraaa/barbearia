// src/app/api/mobile/products/[id]/route.ts
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

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/**
 * GET /api/mobile/products/:id
 *
 * Path:
 * - id: productId
 *
 * Response:
 * - { ok: true, product, item }
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const headers = corsHeaders();

  try {
    await requireMobileAuth(req);

    const { id } = await ctx.params;
    const productId = (id ?? "").trim();

    if (!productId) {
      return NextResponse.json(
        { error: "missing_product_id" },
        { status: 400, headers },
      );
    }

    const p = await prisma.product.findFirst({
      where: { id: productId, isActive: true },
      include: {
        unit: {
          select: { id: true, name: true },
        },
      },
    });

    if (!p) {
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers },
      );
    }

    const pickupDeadlineDays =
      typeof (p as any).pickupDeadlineDays === "number" &&
      Number.isFinite((p as any).pickupDeadlineDays) &&
      (p as any).pickupDeadlineDays > 0
        ? (p as any).pickupDeadlineDays
        : 2;

    const stockQuantity =
      typeof p.stockQuantity === "number" ? p.stockQuantity : 0;

    const product = {
      id: p.id,
      name: p.name,
      imageUrl: p.imageUrl ?? null,
      description: p.description,
      price: Number(p.price),
      category: p.category ?? null,
      stockQuantity,
      isOutOfStock: stockQuantity <= 0,
      pickupDeadlineDays,
      unitId: p.unitId,
      unitName: p.unit?.name ?? "—",
    };

    return NextResponse.json(
      {
        ok: true,
        product,
        item: product, // ✅ alias
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

    console.error("[mobile product detail] error:", e);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500, headers },
    );
  }
}
