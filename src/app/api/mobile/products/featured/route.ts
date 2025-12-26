// src/app/api/mobile/products/featured/route.ts
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

/* ---------------------------------------------------------
 * 🔥 MOTOR DE PREÇO (Mobile) - MESMA REGRA DO /api/mobile/products
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

type PricingInputProduct = {
  id: string;
  unitId: string;
  price: any; // Decimal
  birthdayBenefitEnabled: boolean | null;
  birthdayPriceLevel: any; // CustomerLevel | null (enum)
  prices: Array<{ level: any; price: any }>; // ProductPriceByLevel
};

async function resolveProductUnitPriceFromData(args: {
  product: PricingInputProduct;
  clientBirthday: Date | null;
  effectiveLevel?: CustomerLevel;
  timeZone?: string;
  now?: Date;
}) {
  const timeZone = args.timeZone ?? "America/Sao_Paulo";
  const now = args.now ?? new Date();
  const effectiveLevel: CustomerLevel = args.effectiveLevel ?? "BRONZE";

  const product = args.product;
  const clientBirthday = args.clientBirthday;

  const priceByLevel = new Map<CustomerLevel, number>();

  const rows =
    ((product.prices ?? []) as Array<{ level: unknown; price: unknown }>) ?? [];
  for (const row of rows) {
    const lvl = coerceCustomerLevel(row.level);
    const val = Number(row.price);
    if (lvl && Number.isFinite(val)) priceByLevel.set(lvl, val);
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

    const picked = pickPrice(chosen);

    return {
      unitId: product.unitId,
      basePrice: baseBronze,
      finalPrice: picked.price,
      appliedLevel: picked.level,
      appliedBecause: "BIRTHDAY" as const,
      inBirthdayWindow: true,
    };
  }

  const picked = pickPrice(effectiveLevel);

  return {
    unitId: product.unitId,
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
 * GET /api/mobile/products/featured
 *
 * - Retorna somente produtos em destaque (isFeatured = true)
 * - App enxerga TODAS as unidades (não filtra unitId)
 * - Não tem paginação (lista curta)
 * - Preço já vem resolvido por nível/aniversário (mesma regra do catálogo)
 */
export async function GET(req: Request) {
  const headers = corsHeaders();

  try {
    const auth = await requireMobileAuth(req);

    // ✅ nível do cliente ainda não existe -> default BRONZE
    const customerLevel: CustomerLevel = "BRONZE";
    const clientId = auth.role === "CLIENT" ? auth.sub : null;

    // busca aniversário 1x (evita N+1)
    const client = clientId
      ? await prisma.user.findUnique({
          where: { id: clientId },
          select: { id: true, birthday: true },
        })
      : null;

    const dbProducts = await prisma.product.findMany({
      where: {
        isActive: true,
        isFeatured: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
      include: {
        unit: { select: { id: true, name: true } },
        prices: { select: { level: true, price: true } }, // ✅ needed pro motor
      },
    });

    const items = await Promise.all(
      dbProducts.map(async (p) => {
        const pickupDeadlineDays =
          typeof (p as any).pickupDeadlineDays === "number" &&
          Number.isFinite((p as any).pickupDeadlineDays) &&
          (p as any).pickupDeadlineDays > 0
            ? (p as any).pickupDeadlineDays
            : 2;

        const stockQuantity =
          typeof p.stockQuantity === "number" ? p.stockQuantity : 0;

        const pricing = await resolveProductUnitPriceFromData({
          product: {
            id: p.id,
            unitId: p.unitId,
            price: p.price,
            birthdayBenefitEnabled: (p as any).birthdayBenefitEnabled ?? false,
            birthdayPriceLevel: (p as any).birthdayPriceLevel ?? null,
            prices: (p as any).prices ?? [],
          },
          clientBirthday: client?.birthday ?? null,
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

    return NextResponse.json(
      { ok: true, items, products: items, count: items.length },
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

    console.error("[mobile featured products] error:", e);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500, headers },
    );
  }
}
