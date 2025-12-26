// src/app/api/mobile/orders/[id]/route.ts
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
        // ✅ REMOVIDO: prices (não existe no Prisma Client atual)
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

  // ✅ Como o campo relacional `prices` não existe no schema atual,
  // mantemos um fallback seguro: BRONZE = product.price
  const baseBronze = Number(product.price);

  function pickPrice(level: CustomerLevel) {
    // Mantém a lógica/assinatura do motor, mas sem tabela de preços por nível ainda.
    // (Quando o schema estiver com a relação correta, a gente reativa aqui.)
    for (const _l of LEVEL_FALLBACK[level]) {
      // nada a resolver sem price table
    }
    return { level: "BRONZE" as CustomerLevel, price: baseBronze };
  }

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

  // ✅ Mantemos a janela de aniversário calculada.
  // Sem tabela de preços por nível, o preço final = base.
  if (inBirthdayWindow && product.birthdayBenefitEnabled) {
    const chosen = ((product.birthdayPriceLevel as CustomerLevel | null) ??
      "DIAMANTE") as CustomerLevel;

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

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const headers = corsHeaders();

  try {
    const auth = await requireMobileAuth(req);

    if (auth.role !== "CLIENT") {
      return NextResponse.json(
        { error: "forbidden" },
        { status: 403, headers },
      );
    }

    const { id } = await ctx.params;
    const orderId = String(id ?? "").trim();

    if (!orderId) {
      return NextResponse.json(
        { error: "missing_order_id" },
        { status: 400, headers },
      );
    }

    const o = await prisma.order.findFirst({
      where: { id: orderId, clientId: auth.sub },
      select: {
        id: true,
        status: true,
        createdAt: true,
        reservedUntil: true,
        totalAmount: true,
        unitId: true,
        unit: { select: { id: true, name: true } },
        items: {
          select: {
            id: true,
            productId: true,
            quantity: true,
            unitPrice: true,
            totalPrice: true,
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

    if (!o?.id) {
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers },
      );
    }

    const customerLevel: CustomerLevel = "BRONZE";
    const clientId = auth.sub;

    const enrichedItems = await Promise.all(
      (o.items ?? []).map(async (it) => {
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

        // ✅ Badge só se houver desconto de verdade
        const badge = !hasDiscount
          ? null
          : pricing.appliedBecause === "BIRTHDAY"
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

    const order = {
      id: o.id,
      status: o.status,
      createdAt: o.createdAt,
      reservedUntil: o.reservedUntil,
      totalAmount: Number(o.totalAmount),
      unitId: o.unitId,
      unitName: o.unit?.name ?? "—",
      items: enrichedItems,
    };

    return NextResponse.json(
      { ok: true, order, item: order },
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

    console.error("[mobile orders/:id] error:", e);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500, headers },
    );
  }
}
