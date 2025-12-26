// src/lib/app-jwt.ts
import { SignJWT, jwtVerify } from "jose";

type Role = "CLIENT" | "BARBER" | "ADMIN";

export type AppJwtPayload = {
  sub: string; // userId
  role: Role;

  // ✅ novo: onboarding gate (telefone + aniversário)
  // true  => perfil completo
  // false => deve ser redirecionado ao Profile
  // undefined => tokens antigos / não informado
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
 *
 * ✅ agora pode incluir claim profile_complete (opcional)
 */
export async function signAppJwt(
  payload: AppJwtPayload,
  expiresIn: string = "30d",
): Promise<string> {
  const secret = getSecret();

  const claims: Record<string, unknown> = {
    role: payload.role, // ✅ claim customizada vai no payload
  };

  if (typeof payload.profile_complete === "boolean") {
    claims.profile_complete = payload.profile_complete;
  }

  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.sub) // sub = userId
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

/**
 * Verifica e devolve o payload normalizado.
 *
 * ✅ compat: tokens antigos podem não ter profile_complete
 */
export async function verifyAppJwt(token: string): Promise<AppJwtPayload> {
  const secret = getSecret();

  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"],
  });

  const sub = typeof payload.sub === "string" ? payload.sub : null;
  const role = payload.role as Role | undefined;

  const profile_complete =
    typeof (payload as any)?.profile_complete === "boolean"
      ? ((payload as any).profile_complete as boolean)
      : undefined;

  if (!sub || !role) {
    throw new Error("Invalid token payload.");
  }

  return { sub, role, profile_complete };
}
