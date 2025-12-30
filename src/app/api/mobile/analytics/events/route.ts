// app/api/mobile/analytics/events/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";

export const dynamic = "force-dynamic";

type AnalyticsEventBody = {
  name?: string;
  ts?: string;
  context?: Record<string, any>;
  payload?: Record<string, any>;
};

function jsonError(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function safeString(v: any, max = 120) {
  const s = typeof v === "string" ? v : "";
  const t = s.trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max) : t;
}

function safeObject(v: any, maxKeys = 80) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const keys = Object.keys(v);
  if (keys.length <= maxKeys) return v;
  const out: Record<string, any> = {};
  for (const k of keys.slice(0, maxKeys)) out[k] = (v as any)[k];
  out.__truncatedKeys = keys.length - maxKeys;
  return out;
}

function parseIsoOrNow(iso?: string) {
  if (!iso) return new Date();
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t) : new Date();
}

function pickUnitIdFromContextOrPayload(
  context: Record<string, any>,
  payload: Record<string, any>,
): string | null {
  const candidates = [
    (context as any)?.unitId,
    (context as any)?.unit?.id,
    (payload as any)?.unitId,
    (payload as any)?.unit?.id,
    (payload as any)?.product?.unitId,
    (payload as any)?.productUnitId,
  ];

  for (const c of candidates) {
    const s = typeof c === "string" ? c.trim() : "";
    if (s) return s;
  }
  return null;
}

async function inferUnitIdFromProduct(payload: Record<string, any>) {
  const productId =
    typeof (payload as any)?.productId === "string"
      ? String((payload as any).productId).trim()
      : "";

  if (!productId) return null;

  try {
    const p = await prisma.product.findUnique({
      where: { id: productId },
      select: { unitId: true },
    });
    return p?.unitId ?? null;
  } catch {
    return null;
  }
}

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") || "";
  const a = auth.trim();
  if (!a) return null;

  if (a.toLowerCase().startsWith("bearer ")) {
    const token = a.slice(7).trim();
    return token ? token : null;
  }
  return null;
}

function getSecretKey() {
  const secret = process.env.NEXTAUTH_SECRET || "";
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

async function userIdFromBearerJWT(bearer: string): Promise<string | null> {
  try {
    const key = getSecretKey();
    if (!key) return null;

    const { payload } = await jwtVerify(bearer, key);

    const id =
      typeof (payload as any)?.id === "string"
        ? String((payload as any).id)
        : typeof (payload as any)?.sub === "string"
          ? String((payload as any).sub)
          : null;

    const trimmed = (id || "").trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

// ✅ evita flood de log se o Prisma Client estiver desatualizado
let didWarnMissingDelegate = false;

export async function POST(req: NextRequest) {
  // ✅ 1) tenta cookie/session do NextAuth (web)
  const sessionToken = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  let userId =
    typeof (sessionToken as any)?.id === "string"
      ? (sessionToken as any).id
      : typeof (sessionToken as any)?.sub === "string"
        ? (sessionToken as any).sub
        : null;

  // ✅ 2) tenta Bearer (mobile), se existir
  if (!userId) {
    const bearer = getBearerToken(req);
    if (bearer) userId = await userIdFromBearerJWT(bearer);
  }

  // ✅ analytics nunca pode quebrar UX: se não tem userId, segue anônimo
  let body: AnalyticsEventBody | null = null;
  try {
    body = (await req.json()) as AnalyticsEventBody;
  } catch {
    return jsonError(400, "Invalid JSON");
  }

  const name = safeString(body?.name, 80);
  if (!name) return jsonError(400, "Missing field: name");

  const ts = parseIsoOrNow(safeString(body?.ts, 40));

  const context = safeObject(body?.context, 60);
  const payload = safeObject(body?.payload, 120);

  // anti-abuso simples
  const approxSize = JSON.stringify({
    name,
    ts: ts.toISOString(),
    context,
    payload,
  }).length;
  if (approxSize > 25_000) return jsonError(413, "Payload too large");

  // ✅ unitId: 1) tenta do body 2) tenta inferir via productId
  let unitId = pickUnitIdFromContextOrPayload(context, payload);
  if (!unitId) unitId = await inferUnitIdFromProduct(payload);

  const source = safeString((context as any)?.source, 30) || null;
  const pushId = safeString((context as any)?.pushId, 120) || null;
  const pushType = safeString((context as any)?.pushType, 60) || null;

  const secondsSincePushRaw = Number((context as any)?.secondsSincePush);
  const secondsSincePush = Number.isFinite(secondsSincePushRaw)
    ? Math.max(0, Math.min(60 * 60 * 24 * 30, Math.floor(secondsSincePushRaw)))
    : null;

  const userAgent =
    safeString(req.headers.get("user-agent") || "", 200) || null;

  const xff = req.headers.get("x-forwarded-for");
  const ip = safeString((xff ? xff.split(",")[0] : "") || "", 80) || null;

  // ✅ Guard: se o Prisma Client estiver sem o delegate, não explode.
  const analyticsDelegate = (prisma as any)?.analyticsEvent;
  const canWrite =
    !!analyticsDelegate && typeof analyticsDelegate.create === "function";

  if (!canWrite) {
    if (!didWarnMissingDelegate) {
      didWarnMissingDelegate = true;
      console.log(
        "[analytics] Prisma Client sem delegate analyticsEvent. Evento ignorado (ok=true).",
      );
    }
    return NextResponse.json({ ok: true });
  }

  try {
    await analyticsDelegate.create({
      data: {
        userId: userId ? String(userId) : null,
        unitId: unitId ? String(unitId) : null,

        name,
        ts,

        source,
        pushId,
        pushType,
        secondsSincePush,

        payload,
        context,

        ip,
        userAgent,
      },
    });
  } catch (err) {
    console.log("[analytics] db error:", err);
  }

  return NextResponse.json({ ok: true });
}
