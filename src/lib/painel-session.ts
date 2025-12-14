// src/lib/painel-session.ts
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { AuthenticatedUser } from "./auth";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE_NAME = "painel_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8h

function getJwtSecretKey() {
  const secret = process.env.PAINEL_JWT_SECRET;
  if (!secret) {
    throw new Error("PAINEL_JWT_SECRET não definido no .env");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Payload do JWT do painel.
 * Mantém compatibilidade com o que já existia e adiciona
 * os campos necessários para multi-unidade com segurança.
 */
export type PainelSessionPayload = {
  sub: string; // user id
  role: Role;
  email: string;
  name?: string | null;

  /**
   * Multi-unidade:
   * - Admin de unidade: unitId definido e canSeeAllUnits = false
   * - Admin dono/super admin: canSeeAllUnits = true (unitId pode ser null/undefined)
   * - Barbeiro: normalmente terá unitId (se existir no seu model), canSeeAllUnits = false
   */
  unitId?: string | null;
  canSeeAllUnits?: boolean;
};

function pickUnitIdFromUser(user: AuthenticatedUser): string | null {
  // não assume que o campo existe no tipo
  const anyUser = user as any;
  if ("unitId" in anyUser) {
    const v = anyUser.unitId;
    return typeof v === "string" ? v : v == null ? null : String(v);
  }
  return null;
}

function resolveCanSeeAllUnits(user: AuthenticatedUser, unitId: string | null) {
  // não assume que os campos existem; usa se existirem
  const anyUser = user as any;

  // caso já venha explícito do backend/auth
  if (
    "canSeeAllUnits" in anyUser &&
    typeof anyUser.canSeeAllUnits === "boolean"
  ) {
    return anyUser.canSeeAllUnits;
  }

  // padrão comum: "dono" marcado como isOwner/isMaster/etc.
  if ("isOwner" in anyUser && typeof anyUser.isOwner === "boolean") {
    return anyUser.isOwner;
  }

  // fallback seguro (⚠️ só vale se a gente realmente não souber)
  // - ADMIN sem unitId => antes tratava como super admin
  //   Agora a gente evita isso e deixa o DB decidir (ver abaixo).
  if (user.role === "ADMIN") return false;

  return false;
}

/**
 * ✅ Resolve contexto de unidade no banco (quando o AuthenticatedUser não traz)
 * - ADMIN: lê adminAccess.unitId e user.isOwner
 * - BARBER: não mexe (mantém compat)
 */
async function resolveUnitContextFromDb(user: AuthenticatedUser): Promise<{
  unitId: string | null;
  canSeeAllUnits: boolean;
}> {
  // defaults seguros
  let unitId: string | null = null;
  let canSeeAllUnits = false;

  // Se o objeto do auth já diz "dono", respeita
  const anyUser = user as any;
  const isOwnerFromAuth =
    "isOwner" in anyUser && typeof anyUser.isOwner === "boolean"
      ? anyUser.isOwner
      : null;

  if (user.role !== "ADMIN") {
    // BARBER/CLIENT etc: não inventa regra aqui
    return {
      unitId: pickUnitIdFromUser(user),
      canSeeAllUnits:
        "canSeeAllUnits" in anyUser &&
        typeof anyUser.canSeeAllUnits === "boolean"
          ? anyUser.canSeeAllUnits
          : false,
    };
  }

  // ADMIN: consulta o banco (adminAccess.unitId + user.isOwner)
  let dbUser: any = null;

  try {
    dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        role: true,
        isOwner: true,
        adminAccess: {
          select: {
            unitId: true,
          },
        },
      },
    });
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    const looksLikeMissingField =
      msg.includes("Unknown field") ||
      msg.includes("Unknown arg") ||
      msg.includes("unitId");

    if (!looksLikeMissingField) throw err;

    // fallback: schema ainda sem unitId
    dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        role: true,
        isOwner: true,
        adminAccess: true,
      },
    });
  }

  const isOwner = isOwnerFromAuth ?? (dbUser as any)?.isOwner ?? false;

  // pega unitId do adminAccess se existir
  const dbUnitId = (dbUser as any)?.adminAccess?.unitId;
  unitId =
    dbUnitId == null
      ? null
      : typeof dbUnitId === "string"
        ? dbUnitId
        : String(dbUnitId);

  // dono vê tudo
  if (isOwner) {
    canSeeAllUnits = true;
    unitId = null; // dono não precisa de unitId travado
    return { unitId, canSeeAllUnits };
  }

  // admin não-dono:
  // - se tiver unitId => admin de unidade
  // - se NÃO tiver => trava (não vira super admin por acidente)
  canSeeAllUnits = false;
  return { unitId, canSeeAllUnits };
}

/**
 * Cria um token JWT para o painel (admin / barbeiro)
 */
export async function createSessionToken(
  user: AuthenticatedUser,
): Promise<string> {
  // 1) tenta unitId do objeto de auth (rápido)
  let unitId = pickUnitIdFromUser(user);

  // 2) se for ADMIN e não veio unitId, resolve no banco
  //    (principalmente agora que unidade é obrigatória pro admin)
  let canSeeAllUnits = resolveCanSeeAllUnits(user, unitId);

  if (user.role === "ADMIN") {
    const needsDb = unitId == null;
    if (needsDb) {
      const resolved = await resolveUnitContextFromDb(user);
      unitId = resolved.unitId;
      canSeeAllUnits = resolved.canSeeAllUnits;
    } else {
      // ADMIN com unitId já definido => admin de unidade
      canSeeAllUnits = false;
    }

    // ✅ TRAVA: admin não-dono precisa ter unitId definido
    if (!canSeeAllUnits && !unitId) {
      throw new Error("ADMIN sem unitId no AdminAccess. Vincule uma unidade.");
    }

    // ✅ coerência: se ele vê tudo, unitId não precisa ficar preso
    if (canSeeAllUnits && unitId != null) {
      unitId = null;
    }
  }

  const payload: PainelSessionPayload = {
    sub: user.id,
    role: user.role,
    email: user.email,
    name: user.name,

    unitId,
    canSeeAllUnits,
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

    const p = payload as any;

    const normalized: PainelSessionPayload = {
      sub: String(p.sub),
      role: p.role as Role,
      email: String(p.email),
      name: (p.name ?? null) as string | null,

      unitId:
        p.unitId == null
          ? null
          : typeof p.unitId === "string"
            ? p.unitId
            : String(p.unitId),

      canSeeAllUnits:
        typeof p.canSeeAllUnits === "boolean" ? p.canSeeAllUnits : undefined,
    };

    return normalized;
  } catch {
    return null;
  }
}

/**
 * Helpers para usar em server components / server actions
 */
export async function getCurrentPainelUser(): Promise<PainelSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  return payload;
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
