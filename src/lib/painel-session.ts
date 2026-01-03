// src/lib/painel-session.ts
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { AuthenticatedUser } from "./auth";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE_NAME = "painel_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8h

function getJwtSecretKey() {
  const secret = process.env.PAINEL_JWT_SECRET;
  if (!secret) throw new Error("PAINEL_JWT_SECRET não definido no .env");
  return new TextEncoder().encode(secret);
}

/**
 * 🔑 Fonte da verdade do tenant do painel (ENV)
 * - Quando definido, o painel fica "single-tenant": token e queries devem bater com esse companyId.
 */
function getPainelCompanyIdFromEnv(): string | null {
  const raw = process.env.PAINEL_COMPANY_ID;
  const companyId = raw?.trim();
  return companyId && companyId.length > 0 ? companyId : null;
}

/**
 * Roles aceitos no painel_session.
 * (Devem bater com o middleware.)
 */
export type PainelRole = "ADMIN" | "BARBER";

export type PainelSessionPayload = {
  sub: string;
  role: PainelRole;
  email: string;
  name?: string | null;

  // ✅ tenant atual do painel
  companyId: string;

  // ADMIN pode ter unidade/contexto
  unitId?: string | null;
  canSeeAllUnits?: boolean;
};

function normalizePainelRoleFromUserRole(raw: unknown): PainelRole | null {
  const v = String(raw ?? "").toUpperCase();
  if (v === "ADMIN") return "ADMIN";
  if (v === "BARBER") return "BARBER";
  return null;
}

/**
 * Resolve companyId para BARBER via company_members (role STAFF).
 * - Se PAINEL_COMPANY_ID existe: exige vínculo nessa empresa.
 * - Se não: pega a primeira membership STAFF ativa.
 */
async function resolveCompanyIdForBarber(
  userId: string,
): Promise<string | null> {
  const painelCompanyId = getPainelCompanyIdFromEnv();

  if (painelCompanyId) {
    const membership = await prisma.companyMember.findFirst({
      where: {
        userId,
        companyId: painelCompanyId,
        isActive: true,
        role: "STAFF",
      },
      select: { companyId: true },
    });

    return membership ? painelCompanyId : null;
  }

  const first = await prisma.companyMember.findFirst({
    where: {
      userId,
      isActive: true,
      role: "STAFF",
    },
    orderBy: { createdAt: "asc" },
    select: { companyId: true },
  });

  return first?.companyId ? String(first.companyId) : null;
}

export async function createSessionToken(
  user: AuthenticatedUser,
): Promise<string> {
  const painelRole = normalizePainelRoleFromUserRole((user as any)?.role);
  if (!painelRole) {
    throw new Error("Sem permissão");
  }

  const painelCompanyId = getPainelCompanyIdFromEnv();

  // ===== ADMIN =====
  if (painelRole === "ADMIN") {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        adminAccesses: { select: { companyId: true, unitId: true } },
        companyMemberships: {
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
          select: { companyId: true, role: true },
        },
      },
    });

    if (!dbUser) throw new Error("Sem acesso");

    // 1) decide companyId do token (determinístico)
    // - se ENV existe: ele manda
    // - senão: primeira membership ativa; se não houver, primeira adminAccess
    const fallbackCompanyId =
      dbUser.companyMemberships?.[0]?.companyId ??
      dbUser.adminAccesses?.[0]?.companyId ??
      null;

    const companyId =
      painelCompanyId ?? (fallbackCompanyId ? String(fallbackCompanyId) : null);

    if (!companyId) {
      if (painelCompanyId) throw new Error("missing_company");
      throw new Error(
        "ADMIN sem companyId (sem Membership/AdminAccess). Crie o vínculo na empresa.",
      );
    }

    // 2) tenant fixo: garante vínculo nessa company
    if (painelCompanyId) {
      const hasMembership = !!dbUser.companyMemberships?.some(
        (m) => String(m.companyId) === painelCompanyId,
      );
      const hasAccess = !!dbUser.adminAccesses?.some(
        (a) => String(a.companyId) === painelCompanyId,
      );
      if (!hasMembership && !hasAccess) {
        throw new Error("missing_company");
      }
    }

    // 3) isOwner por membership na company atual (alinha com admin-permissions.ts)
    const membershipForCompany =
      dbUser.companyMemberships?.find(
        (m) => String(m.companyId) === String(companyId),
      ) ?? null;

    const isOwner = String(membershipForCompany?.role ?? "") === "OWNER";
    const canSeeAllUnits = isOwner;

    // 4) unitId por AdminAccess da company atual (se não-owner)
    const accessForCompany =
      dbUser.adminAccesses?.find(
        (a) => String(a.companyId) === String(companyId),
      ) ?? null;

    const unitId = isOwner ? null : (accessForCompany?.unitId ?? null);

    if (!canSeeAllUnits && !unitId) {
      throw new Error(
        "ADMIN sem unitId no AdminAccess dessa company. Vincule uma unidade.",
      );
    }

    const payload: PainelSessionPayload = {
      sub: user.id,
      role: "ADMIN",
      email: user.email,
      name: user.name,
      companyId: String(companyId),
      unitId: unitId ? String(unitId) : null,
      canSeeAllUnits,
    };

    const secret = getJwtSecretKey();

    return await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
      .sign(secret);
  }

  // ===== BARBER =====
  // BARBER não depende de adminAccess e não exige unitId.
  const companyId = painelCompanyId ?? (user as any).companyId ?? null;

  const resolvedCompanyId =
    companyId && painelCompanyId
      ? String(companyId) // tenant fixo: já é o ENV
      : String(companyId ?? (await resolveCompanyIdForBarber(user.id)) ?? "");

  if (!resolvedCompanyId) {
    if (painelCompanyId) throw new Error("missing_company");
    throw new Error("Sem empresa vinculada.");
  }

  // Se tenant fixo, garante match
  if (painelCompanyId && String(resolvedCompanyId) !== painelCompanyId) {
    throw new Error("missing_company");
  }

  const payload: PainelSessionPayload = {
    sub: user.id,
    role: "BARBER",
    email: user.email,
    name: user.name,
    companyId: String(resolvedCompanyId),
    unitId: null,
    canSeeAllUnits: false,
  };

  const secret = getJwtSecretKey();

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secret);
}

export async function verifySessionToken(
  token: string,
): Promise<PainelSessionPayload | null> {
  try {
    const secret = getJwtSecretKey();
    const { payload } = await jwtVerify(token, secret);
    const p = payload as any;

    if (!p?.companyId) return null;

    const companyId = String(p.companyId);

    // tenant fixo: token precisa bater
    const painelCompanyId = getPainelCompanyIdFromEnv();
    if (painelCompanyId && companyId !== painelCompanyId) return null;

    const role = String(p.role ?? "").toUpperCase();
    if (role !== "ADMIN" && role !== "BARBER") return null;

    return {
      sub: String(p.sub),
      role: role as PainelRole,
      email: String(p.email),
      name: (p.name ?? null) as string | null,
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

export async function getCurrentPainelUser(): Promise<PainelSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifySessionToken(token);
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
