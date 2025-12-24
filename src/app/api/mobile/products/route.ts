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

/* ---------------------------------------------------------
 * 🔥 MOTOR DE PREÇO (Mobile)
 * - Cliente level (M+1) ainda não existe -> default BRONZE
 * - Se estiver na janela de aniversário e produto tiver benefício:
 *   usa birthdayPriceLevel
 * - Fallbacks por nível (DIAMANTE -> OURO -> PRATA -> BRONZE)
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

// ✅ garante que só aceita string válida como CustomerLevel
function coerceCustomerLevel(value: unknown): CustomerLevel | null {
  if (
    value === "BRONZE" ||
    value === "PRATA" ||
    value === "OURO" ||
    value === "DIAMANTE"
  ) {
    return value;
  }
  return null;
}

async function resolveProductUnitPrice(args: {
  productId: string;
  clientId: string | null;
  effectiveLevel?: CustomerLevel; // M+1 futuro
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
        prices: { select: { level: true, price: true } }, // ProductPriceByLevel (se existir)
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

  const priceByLevel = new Map<CustomerLevel, number>();

  // ✅ rows protegidos contra tipagens estranhas
  const rows =
    (((product as any).prices ?? []) as Array<{
      level: unknown;
      price: unknown;
    }>) ?? [];
  for (const row of rows) {
    const lvl = coerceCustomerLevel(row.level);
    const val = Number(row.price);
    if (lvl && Number.isFinite(val)) priceByLevel.set(lvl, val);
  }

  // base BRONZE (fallback no price “antigo” do produto)
  const baseBronze =
    priceByLevel.get("BRONZE") ?? Number((product as any).price);

  function pickPrice(level: CustomerLevel) {
    for (const l of LEVEL_FALLBACK[level]) {
      const found = priceByLevel.get(l);
      if (typeof found === "number" && Number.isFinite(found)) {
        return { level: l, price: found };
      }
    }
    return { level: "BRONZE" as CustomerLevel, price: baseBronze };
  }

  // janela de aniversário: 3 dias antes + dia + 3 dias depois (por dia no TZ)
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

  // ✅ aniversário ganha prioridade quando habilitado
  if (inBirthdayWindow && (product as any).birthdayBenefitEnabled) {
    // 🔒 blindagem: só usa se for CustomerLevel válido, senão DIAMANTE
    const chosen =
      coerceCustomerLevel((product as any).birthdayPriceLevel) ??
      ("DIAMANTE" as CustomerLevel);

    const picked = pickPrice(chosen);

    return {
      unitId: (product as any).unitId as string,
      basePrice: baseBronze,
      finalPrice: picked.price,
      appliedLevel: picked.level,
      appliedBecause: "BIRTHDAY" as const,
      inBirthdayWindow: true,
    };
  }

  // nível do cliente (por enquanto BRONZE)
  const picked = pickPrice(effectiveLevel);

  return {
    unitId: (product as any).unitId as string,
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
    // 🔐 exige auth + pega clientId pra precificação (aniversário)
    const auth = await requireMobileAuth(req);

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
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        unit: { select: { id: true, name: true } },
      },
    });

    const hasMore = dbProducts.length > limit;
    const page = hasMore ? dbProducts.slice(0, limit) : dbProducts;

    // ✅ nível do cliente ainda não existe -> default BRONZE
    const customerLevel: CustomerLevel = "BRONZE";
    const clientId = auth.role === "CLIENT" ? auth.sub : null;

    const items = await Promise.all(
      page.map(async (p) => {
        const pickupDeadlineDays =
          typeof (p as any).pickupDeadlineDays === "number" &&
          Number.isFinite((p as any).pickupDeadlineDays) &&
          (p as any).pickupDeadlineDays > 0
            ? (p as any).pickupDeadlineDays
            : 2;

        const stockQuantity =
          typeof p.stockQuantity === "number" ? p.stockQuantity : 0;

        const pricing = await resolveProductUnitPrice({
          productId: p.id,
          clientId,
          effectiveLevel: customerLevel,
          timeZone: "America/Sao_Paulo",
          now: new Date(),
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
          id: p.id,
          name: p.name,
          imageUrl: p.imageUrl ?? null,
          description: p.description,
          category: p.category ?? null,

          stockQuantity,
          isOutOfStock: stockQuantity <= 0,
          pickupDeadlineDays,
          unitId: p.unitId,
          unitName: p.unit?.name ?? "—",

          basePrice,
          finalPrice,
          hasDiscount,

          // compat: "price" = preço final
          price: finalPrice,

          pricing: {
            customerLevel,
            appliedLevel: pricing.appliedLevel,
            appliedBecause: pricing.appliedBecause,
            inBirthdayWindow: pricing.inBirthdayWindow,
          },

          badge,
        };
      }),
    );

    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

    return NextResponse.json(
      { ok: true, items, products: items, count: items.length, nextCursor },
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
