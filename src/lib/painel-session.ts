// src/lib/painel-session.ts
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { AuthenticatedUser } from "./auth";
import type { Role } from "@prisma/client";

const SESSION_COOKIE_NAME = "painel_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8h

function getJwtSecretKey() {
  const secret = process.env.PAINEL_JWT_SECRET;
  if (!secret) {
    throw new Error("PAINEL_JWT_SECRET não definido no .env");
  }
  return new TextEncoder().encode(secret);
}

type PainelSessionPayload = {
  sub: string; // user id
  role: Role;
  email: string;
  name?: string | null;
};

/**
 * Cria um token JWT para o painel (admin / barbeiro)
 */
export async function createSessionToken(
  user: AuthenticatedUser,
): Promise<string> {
  const payload: PainelSessionPayload = {
    sub: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
  };

  const secret = getJwtSecretKey();

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secret);

  return token;
}

/**
 * Lê e valida o token a partir de um valor de cookie
 */
export async function verifySessionToken(
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

/**
 * Helpers para usar em server components / server actions
 */

export async function getCurrentPainelUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  return payload; // { sub, role, email, name }
}

export async function createPainelSessionCookie(user: AuthenticatedUser) {
  const token = await createSessionToken(user);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearPainelSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
