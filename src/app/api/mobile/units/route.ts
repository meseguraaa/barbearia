// src/app/api/mobile/units/route.ts
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

type MobileTokenPayload = {
  sub: string;
  role?: "CLIENT" | "BARBER" | "ADMIN";
  companyId: string; // ✅ multi-tenant obrigatório

  // ⚠️ email/name NÃO estão no JWT do app (signAppJwt só coloca role + sub),
  // mas mantemos aqui opcional pra não quebrar logs/compat.
  email?: string;
  name?: string | null;
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function getJwtSecretKey() {
  const secret = process.env.APP_JWT_SECRET;
  if (!secret) throw new Error("APP_JWT_SECRET não definido no .env");
  return new TextEncoder().encode(secret);
}

function normalizeSub(payload: any) {
  const sub = typeof payload?.sub === "string" ? payload.sub.trim() : "";
  return sub;
}

function normalizeCompanyId(payload: any) {
  const companyId =
    typeof payload?.companyId === "string"
      ? String(payload.companyId).trim()
      : "";
  return companyId;
}

async function requireMobileAuth(
  req: Request,
  reqId: string,
): Promise<MobileTokenPayload> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  // ✅ log do header (sem vazar token inteiro)
  console.log(
    `[mobile/units:${reqId}] auth header:`,
    auth ? "present" : "missing",
  );
  console.log(
    `[mobile/units:${reqId}] token length:`,
    token ? String(token.length) : "0",
  );

  if (!token) throw new Error("Token ausente");

  const { payload } = await jwtVerify(token, getJwtSecretKey(), {
    algorithms: ["HS256"],
  });

  const sub = normalizeSub(payload);
  if (!sub) throw new Error("Token inválido");

  const role = (payload as any)?.role as MobileTokenPayload["role"];

  const companyId = normalizeCompanyId(payload);
  if (!companyId) throw new Error("companyId ausente no token");

  return {
    sub,
    role,
    companyId,
    // mantém compat (se vier no token de algum ambiente)
    email:
      typeof (payload as any)?.email === "string"
        ? (payload as any).email
        : undefined,
    name: (payload as any)?.name ?? null,
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
  const reqId = Math.random().toString(16).slice(2, 8);
  const startedAt = Date.now();

  try {
    // ✅ prova que a rota foi chamada
    console.log(
      `\n[mobile/units:${reqId}] ====== GET /api/mobile/units ======`,
    );
    console.log(`[mobile/units:${reqId}] url:`, req.url);
    console.log(`[mobile/units:${reqId}] time:`, new Date().toISOString());

    // ✅ ajuda a detectar “outro ambiente / outro banco”
    console.log(
      `[mobile/units:${reqId}] env DATABASE_URL:`,
      process.env.DATABASE_URL ? "present" : "missing",
    );
    console.log(
      `[mobile/units:${reqId}] env APP_JWT_SECRET:`,
      process.env.APP_JWT_SECRET ? "present" : "missing",
    );

    const payload = await requireMobileAuth(req, reqId);

    // ✅ debug do token (sem expor tudo)
    console.log(`[mobile/units:${reqId}] auth payload:`, {
      sub: payload.sub,
      role: payload.role ?? null,
      companyId: payload.companyId,
      email: payload.email ?? null,
    });

    console.log(`[mobile/units:${reqId}] querying prisma.unit.findMany...`);

    // ✅ multi-tenant REAL: sempre filtra por companyId
    const units = await prisma.unit.findMany({
      where: {
        companyId: payload.companyId,
        // ✅ mantém compatibilidade: traz true e null (só exclui false)
        isActive: { not: false },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });

    console.log(`[mobile/units:${reqId}] prisma returned:`, {
      count: units.length,
      sample: units.slice(0, 3), // só 3 pra não poluir log
    });

    console.log(`[mobile/units:${reqId}] done in(ms):`, Date.now() - startedAt);

    return NextResponse.json(
      {
        ok: true,
        units,
        auth: {
          sub: payload.sub,
          role: payload.role ?? null,
          companyId: payload.companyId,
        },
        count: units.length,
      },
      { status: 200, headers: corsHeaders() },
    );
  } catch (err: any) {
    const msg = String(err?.message ?? "Erro");

    console.error(`[mobile/units:${reqId}] ❌ error name:`, err?.name);
    console.error(`[mobile/units:${reqId}] ❌ error message:`, msg);
    console.error(`[mobile/units:${reqId}] ❌ error stack:`, err?.stack);
    console.error(`[mobile/units:${reqId}] ❌ raw:`, err);

    // se for Prisma
    console.error(`[mobile/units:${reqId}] prisma code:`, err?.code);
    console.error(`[mobile/units:${reqId}] prisma meta:`, err?.meta);

    // ✅ token/jwt/companyId: devolve 401 (não mascare como 500)
    const lower = msg.toLowerCase();
    if (
      lower.includes("token") ||
      lower.includes("jwt") ||
      lower.includes("signature") ||
      lower.includes("jws") ||
      lower.includes("unauthorized") ||
      lower.includes("não autorizado") ||
      lower.includes("companyid")
    ) {
      return NextResponse.json(
        { ok: false, error: "Não autorizado" },
        { status: 401, headers: corsHeaders() },
      );
    }

    const isDev = process.env.NODE_ENV !== "production";

    return NextResponse.json(
      {
        ok: false,
        error: "Erro ao listar unidades",
        details: isDev ? msg || "no-message" : undefined,
      },
      { status: 500, headers: corsHeaders() },
    );
  }
}
