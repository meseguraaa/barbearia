// app/api/cron/expire-reservations/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Cron endpoint to expire product reservations (PENDING_CHECKIN) when reservedUntil <= now.
 *
 * Security:
 * - Set CRON_SECRET in env.
 * - Call with header: x-cron-secret: <CRON_SECRET>
 *
 * What it does (idempotent):
 * - Finds orders with status PENDING_CHECKIN, reservedUntil not null, reservedUntil <= now
 * - Updates them to EXPIRED, sets expiredAt, and sets inventoryRevertedAt (for future stock reversion logic)
 *
 * Notes:
 * - Today your reservation flow does NOT decrement stock / create financial entries.
 *   So "inventoryRevertedAt" is just the marker that this reservation is finalized as expired.
 * - When you later implement reserved stock accounting, you'll add the revert logic inside the transaction
 *   (and only run it when inventoryRevertedAt is null).
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET não configurado." },
      { status: 500 },
    );
  }

  const headerSecret = req.headers.get("x-cron-secret");
  if (headerSecret !== secret) {
    return NextResponse.json(
      { ok: false, error: "Não autorizado." },
      { status: 401 },
    );
  }

  const now = new Date();

  try {
    // We do this in two steps for better control/observability and future per-order revert logic.
    const expirable = await prisma.order.findMany({
      where: {
        status: "PENDING_CHECKIN",
        reservedUntil: { not: null, lte: now },
      },
      select: { id: true },
      orderBy: { reservedUntil: "asc" },
      take: 500, // safety cap per run; cron can run frequently
    });

    if (expirable.length === 0) {
      return NextResponse.json({
        ok: true,
        expired: 0,
        now: now.toISOString(),
      });
    }

    const ids = expirable.map((o) => o.id);

    const result = await prisma.order.updateMany({
      where: {
        id: { in: ids },
        status: "PENDING_CHECKIN", // idempotent guard
      },
      data: {
        status: "EXPIRED",
        expiredAt: now,
        inventoryRevertedAt: now,
        updatedAt: now,
      },
    });

    return NextResponse.json({
      ok: true,
      expired: result.count,
      processed: ids.length,
      now: now.toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Erro inesperado ao expirar reservas.",
      },
      { status: 500 },
    );
  }
}

// Optional: quick health-check in browser (still protected)
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET não configurado." },
      { status: 500 },
    );
  }

  const headerSecret = req.headers.get("x-cron-secret");
  if (headerSecret !== secret) {
    return NextResponse.json(
      { ok: false, error: "Não autorizado." },
      { status: 401 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Expire reservations cron endpoint ready.",
  });
}
