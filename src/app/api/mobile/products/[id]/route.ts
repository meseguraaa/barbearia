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

/* ---------------------------------------------------------
 * 🔥 MOTOR DE PREÇO (Mobile) - DESCONTO (%)
 * - Base: Product.price (preço cheio)
 * - CustomerLevelState por unidade -> levelCurrent (se existir)
 * - Se estiver na janela de aniversário e produto tiver benefício:
 *   usa birthdayPriceLevel (como nível "forçado" pra desconto)
 * - Fallbacks por nível (DIAMANTE -> OURO -> PRATA -> BRONZE)
 * - Regra B: “campo vazio” = 0% (sem registro = 0)
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

function clampPct(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.floor(n)));
}

function roundMoney(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function calcFinalPrice(basePrice: number, discountPct: number) {
  const pct = clampPct(discountPct);
  const final = basePrice * (1 - pct / 100);
  return roundMoney(final);
}

type PricingInputProduct = {
  id: string;
  unitId: string;
  price: any; // Decimal
  birthdayBenefitEnabled: boolean | null;
  birthdayPriceLevel: any; // CustomerLevel | null
  discounts: Array<{ level: any; discountPct: any }>;
};

async function resolveProductUnitPriceFromData(args: {
  product: PricingInputProduct;
  clientBirthday: Date | null;
  effectiveLevel?: CustomerLevel; // nível vigente (por unidade)
  timeZone?: string;
  now?: Date;
}) {
  const timeZone = args.timeZone ?? "America/Sao_Paulo";
  const now = args.now ?? new Date();
  const effectiveLevel: CustomerLevel = args.effectiveLevel ?? "BRONZE";

  const product = args.product;
  const clientBirthday = args.clientBirthday;

  const basePrice = Number(product.price);

  const discountByLevel = new Map<CustomerLevel, number>();
  const rows =
    ((product.discounts ?? []) as Array<{
      level: unknown;
      discountPct: unknown;
    }>) ?? [];

  for (const row of rows) {
    const lvl = coerceCustomerLevel(row.level);
    const pct = clampPct(Number(row.discountPct));
    if (lvl) discountByLevel.set(lvl, pct);
  }

  // ✅ Regra B: sem registro = 0%
  function pickDiscount(level: CustomerLevel) {
    for (const l of LEVEL_FALLBACK[level]) {
      if (discountByLevel.has(l)) {
        return { level: l, discountPct: discountByLevel.get(l)! };
      }
    }
    return { level: "BRONZE" as CustomerLevel, discountPct: 0 };
  }

  // janela de aniversário: 3 dias antes + dia + 3 dias depois (por dia no TZ)
  let inBirthdayWindow = false;

  if (clientBirthday && product.birthdayBenefitEnabled) {
    const nowParts = getDatePartsInTz(now, timeZone);
    const b = getDatePartsInTz(clientBirthday, timeZone);

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
    const chosen =
      coerceCustomerLevel(product.birthdayPriceLevel) ??
      ("DIAMANTE" as CustomerLevel);

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
      },
    }),
    args.clientId
      ? prisma.user.findUnique({
          where: { id: args.clientId },
          select: { id: true, birthday: true },
        })
      : Promise.resolve(null),
  ]);

  if (!product) throw new Error("Produto não encontrado.");

  // ✅ descontos do produto (tabela mapeada @@map("product_prices_by_level"))
  // Model correto: ProductDiscountByLevel => prisma.productDiscountByLevel
  const discountRows = await prisma.productDiscountByLevel.findMany({
    where: { productId: product.id },
    select: { level: true, discountPct: true },
  });

  return resolveProductUnitPriceFromData({
    product: {
      id: product.id,
      unitId: product.unitId,
      price: product.price,
      birthdayBenefitEnabled: product.birthdayBenefitEnabled ?? false,
      birthdayPriceLevel: product.birthdayPriceLevel ?? null,
      discounts: discountRows,
    },
    clientBirthday: client?.birthday ?? null,
    effectiveLevel,
    timeZone,
    now,
  });
}

/**
 * GET /api/mobile/products/:id
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const headers = corsHeaders();

  try {
    const auth = await requireMobileAuth(req);

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
      select: {
        id: true,
        unitId: true,
        name: true,
        imageUrl: true,
        description: true,
        category: true,
        stockQuantity: true,
        price: true,
        pickupDeadlineDays: true,
        unit: { select: { id: true, name: true } },
      },
    });

    if (!p) {
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers },
      );
    }

    const pickupDeadlineDays =
      typeof p.pickupDeadlineDays === "number" &&
      Number.isFinite(p.pickupDeadlineDays) &&
      p.pickupDeadlineDays > 0
        ? p.pickupDeadlineDays
        : 2;

    const stockQuantity =
      typeof p.stockQuantity === "number" ? p.stockQuantity : 0;

    const clientId = auth.role === "CLIENT" ? auth.sub : null;

    // ✅ nível do cliente por unidade (detail = 1 unidade)
    let customerLevel: CustomerLevel = "BRONZE";
    if (clientId) {
      const state = await prisma.customerLevelState.findFirst({
        where: { userId: clientId, unitId: p.unitId },
        select: { levelCurrent: true },
      });
      const lvl = coerceCustomerLevel(state?.levelCurrent);
      if (lvl) customerLevel = lvl;
    }

    const pricing = await resolveProductUnitPrice({
      productId: p.id,
      clientId,
      effectiveLevel: customerLevel,
      timeZone: "America/Sao_Paulo",
      now: new Date(),
    });

    const basePrice = Number(pricing.basePrice);
    const finalPrice = Number(pricing.finalPrice);
    const discountPct = clampPct(Number(pricing.discountPct ?? 0));

    const hasDiscount =
      Number.isFinite(basePrice) &&
      Number.isFinite(finalPrice) &&
      finalPrice < basePrice;

    const savings = hasDiscount
      ? roundMoney(Math.max(0, basePrice - finalPrice))
      : 0;

    const badge =
      pricing.appliedBecause === "BIRTHDAY"
        ? { type: "BIRTHDAY" as const, label: "🎂 Aniversário" }
        : hasDiscount
          ? { type: "DISCOUNT" as const, label: `${discountPct}% OFF` }
          : null;

    const product = {
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
      savings,
      discountPct,

      // compat: "price" = preço final
      price: finalPrice,

      pricing: {
        customerLevel,
        appliedLevel: pricing.appliedLevel,
        appliedBecause: pricing.appliedBecause,
        inBirthdayWindow: pricing.inBirthdayWindow,
        discountPct,
      },

      badge,
    };

    return NextResponse.json(
      { ok: true, product, item: product },
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
