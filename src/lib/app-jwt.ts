// src/lib/app-jwt.ts
import { SignJWT, jwtVerify } from "jose";

type Role = "CLIENT" | "BARBER" | "ADMIN";

export type AppJwtPayload = {
  sub: string; // userId
  role: Role;

  // ✅ multi-tenant REAL: tenant obrigatório no app token
  companyId: string;

  // ✅ onboarding gate (telefone + aniversário)
  profile_complete?: boolean;
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

  const companyId =
    typeof payload.companyId === "string" ? payload.companyId.trim() : "";

  if (!companyId) {
    throw new Error("Missing companyId for app token.");
  }

  const claims: Record<string, unknown> = {
    role: payload.role,
    companyId,
  };

  if (typeof payload.profile_complete === "boolean") {
    claims.profile_complete = payload.profile_complete;
  }

  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.sub)
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

  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  const role = payload.role as Role | undefined;

  const companyId =
    typeof (payload as any)?.companyId === "string"
      ? String((payload as any).companyId).trim()
      : "";

  const profile_complete =
    typeof (payload as any)?.profile_complete === "boolean"
      ? ((payload as any).profile_complete as boolean)
      : undefined;

  if (!sub || !role) {
    throw new Error("Invalid token payload.");
  }

  if (!companyId) {
    throw new Error("Invalid token payload: missing companyId.");
  }

  return { sub, role, companyId, profile_complete };
}
