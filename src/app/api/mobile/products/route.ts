// src/app/api/mobile/products/route.ts
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
 * GET /api/mobile/products
 *
 * Query:
 * - unit: "all" | unitId (default: "all")
 * - q: string (busca por nome/descrição)
 * - category: string (match exato por enquanto)
 * - inStock: "1" | "true" (se quiser só com estoque)
 * - cursor: productId (paginação)
 * - limit: number (default 20, max 50)
 */
export async function GET(req: Request) {
  const headers = corsHeaders();

  try {
    // 🔐 exige auth (mantém padrão do app)
    await requireMobileAuth(req);

    const url = new URL(req.url);

    const unitParam = (url.searchParams.get("unit") ?? "all").trim();
    const q = (url.searchParams.get("q") ?? "").trim();
    const category = (url.searchParams.get("category") ?? "").trim();
    const inStockRaw = (url.searchParams.get("inStock") ?? "").trim();
    const cursor = (url.searchParams.get("cursor") ?? "").trim();
    const limit = parseLimit(url.searchParams.get("limit"));

    const unitIsAll = unitParam === "all" || unitParam === "";
    let activeUnitId: string | null = null;

    if (!unitIsAll) {
      // ✅ valida unidade (ativa) igual no client web
      const unit = await prisma.unit.findFirst({
        where: { id: unitParam, isActive: true },
        select: { id: true },
      });

      if (!unit) {
        return NextResponse.json(
          { error: "invalid_unit" },
          { status: 400, headers },
        );
      }

      activeUnitId = unit.id;
    }

    const inStock =
      inStockRaw === "1" ||
      inStockRaw.toLowerCase() === "true" ||
      inStockRaw.toLowerCase() === "yes";

    const where: any = {
      isActive: true,
      ...(activeUnitId ? { unitId: activeUnitId } : {}),
      ...(inStock ? { stockQuantity: { gt: 0 } } : {}),
      ...(category ? { category } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const dbProducts = await prisma.product.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1, // 🔁 pega 1 a mais pra saber se tem próxima página
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        unit: {
          select: { id: true, name: true },
        },
      },
    });

    const hasMore = dbProducts.length > limit;
    const page = hasMore ? dbProducts.slice(0, limit) : dbProducts;

    const items = page.map((p) => {
      const pickupDeadlineDays =
        typeof (p as any).pickupDeadlineDays === "number" &&
        Number.isFinite((p as any).pickupDeadlineDays) &&
        (p as any).pickupDeadlineDays > 0
          ? (p as any).pickupDeadlineDays
          : 2;

      const stockQuantity =
        typeof p.stockQuantity === "number" ? p.stockQuantity : 0;

      return {
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
    });

    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

    return NextResponse.json(
      {
        ok: true,
        items,
        products: items, // alias compatível
        count: items.length,
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

    console.error("[mobile products] error:", e);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500, headers },
    );
  }
}
