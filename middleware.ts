// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE_NAME = "painel_session";

function getJwtSecretKey() {
  const secret = process.env.PAINEL_JWT_SECRET;
  if (!secret) {
    throw new Error("PAINEL_JWT_SECRET não definido no .env");
  }
  return new TextEncoder().encode(secret);
}

function getPainelCompanyIdFromEnv(): string | null {
  const raw = process.env.PAINEL_COMPANY_ID;
  const companyId = raw?.trim();
  return companyId && companyId.length > 0 ? companyId : null;
}

type PainelRole = "OWNER" | "ADMIN" | "STAFF" | "CLIENT";

type PainelSessionPayload = {
  sub: string;
  role: PainelRole;
  email: string;
  name?: string | null;

  companyId: string;

  unitId?: string | null;
  canSeeAllUnits?: boolean;
};

async function verifySessionToken(
  token: string,
): Promise<PainelSessionPayload | null> {
  try {
    const secret = getJwtSecretKey();
    const { payload } = await jwtVerify(token, secret);
    const p = payload as any;

    if (!p?.companyId) return null;

    const companyId = String(p.companyId);

    const envCompanyId = getPainelCompanyIdFromEnv();
    if (envCompanyId && companyId !== envCompanyId) return null;

    const role = String(p.role ?? "").toUpperCase() as PainelRole;
    if (!["OWNER", "ADMIN", "STAFF", "CLIENT"].includes(role)) return null;

    return {
      sub: String(p.sub),
      role,
      email: String(p.email),
      name: (p.name ?? null) as any,
      companyId,
      unitId:
        p.unitId == null
          ? null
          : typeof p.unitId === "string"
            ? p.unitId
            : String(p.unitId),
      canSeeAllUnits:
        typeof p.canSeeAllUnits === "boolean" ? p.canSeeAllUnits : undefined,
    };
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminRoute = pathname.startsWith("/admin");
  const isBarberRoute = pathname.startsWith("/barber");

  if (!isAdminRoute && !isBarberRoute) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/painel/login", req.url));
  }

  const payload = await verifySessionToken(token);

  if (!payload) {
    const res = NextResponse.redirect(new URL("/painel/login", req.url));
    res.cookies.delete(SESSION_COOKIE_NAME);
    return res;
  }

  const role = payload.role;

  // /admin: só ADMIN (se quiser OWNER também, inclua aqui)
  if (isAdminRoute && role !== "ADMIN") {
    return NextResponse.redirect(
      new URL("/painel/login?error=permissao", req.url),
    );
  }

  // /barber: STAFF (profissional) e ADMIN (opcional)
  if (isBarberRoute && !(role === "STAFF" || role === "ADMIN")) {
    return NextResponse.redirect(
      new URL("/painel/login?error=permissao", req.url),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/barber/:path*"],
};
