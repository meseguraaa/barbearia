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

type PainelSessionPayload = {
  sub: string;
  role: "CLIENT" | "BARBER" | "ADMIN";
  email: string;
  name?: string | null;
};

async function verifySessionToken(
  token: string,
): Promise<PainelSessionPayload | null> {
  try {
    const secret = getJwtSecretKey();
    const { payload } = await jwtVerify(token, secret);
    return payload as PainelSessionPayload;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdminRoute = pathname.startsWith("/admin");
  const isBarberRoute = pathname.startsWith("/barber");

  // Rotas não protegidas seguem normal
  if (!isAdminRoute && !isBarberRoute) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  // Sem cookie → manda pro login
  if (!token) {
    return NextResponse.redirect(new URL("/painel/login", req.url));
  }

  const payload = await verifySessionToken(token);

  // Token inválido → limpa cookie e manda pro login
  if (!payload) {
    const res = NextResponse.redirect(new URL("/painel/login", req.url));
    res.cookies.delete(SESSION_COOKIE_NAME);
    return res;
  }

  const role = payload.role;

  // Proteção admin → só ADMIN acessa /admin/**
  if (isAdminRoute && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/painel/login", req.url));
  }

  // Proteção barbeiro → só BARBER acessa /barber/**
  if (isBarberRoute && role !== "BARBER") {
    return NextResponse.redirect(new URL("/painel/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/barber/:path*"],
};
