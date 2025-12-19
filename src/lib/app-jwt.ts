// src/lib/app-jwt.ts
import { SignJWT, jwtVerify } from "jose";

type Role = "CLIENT" | "BARBER" | "ADMIN";

export type AppJwtPayload = {
  sub: string; // userId
  role: Role;
};

function getSecret(): Uint8Array {
  const secret = process.env.APP_JWT_SECRET || process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new Error(
      "Missing JWT secret. Set APP_JWT_SECRET (recommended) or NEXTAUTH_SECRET.",
    );
  }

  return new TextEncoder().encode(secret);
}

/**
 * Emite JWT pro app (mobile) usar como Bearer token.
 * Default: 30 dias.
 */
export async function signAppJwt(
  payload: AppJwtPayload,
  expiresIn: string = "30d",
): Promise<string> {
  const secret = getSecret();

  return new SignJWT({
    role: payload.role, // ✅ claim customizada vai no payload
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.sub) // sub = userId
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

/**
 * Verifica e devolve o payload normalizado.
 */
export async function verifyAppJwt(token: string): Promise<AppJwtPayload> {
  const secret = getSecret();

  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"],
  });

  const sub = typeof payload.sub === "string" ? payload.sub : null;
  const role = payload.role as Role | undefined;

  if (!sub || !role) {
    throw new Error("Invalid token payload.");
  }

  return { sub, role };
}
