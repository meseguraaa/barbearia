// src/lib/auth.ts
import type { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

export type AuthenticatedUser = {
  id: string;
  name: string | null;
  email: string;
  role: Role;

  // ✅ Multi-empresa
  companyId?: string | null;

  // ✅ Multi-unidade
  unitId?: string | null;

  // ✅ owner por company (via CompanyMember.role)
  isOwner?: boolean;
};

export class AuthError extends Error {
  constructor(message = "Credenciais inválidas.") {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * 🔑 Fonte da verdade do tenant do painel (ENV)
 * - Quando definido, o login do painel DEVE amarrar tudo nessa company.
 */
function getPainelCompanyIdFromEnv(): string | null {
  const raw = process.env.PAINEL_COMPANY_ID;
  const companyId = raw?.trim();
  return companyId && companyId.length > 0 ? companyId : null;
}

/**
 * Implementação injetável (CORE-FRIENDLY)
 */
export async function loginWithCredentialsWithPrisma(
  prisma: PrismaClient,
  email: string,
  password: string,
): Promise<AuthenticatedUser> {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      passwordHash: true,

      // ✅ acessos admin
      adminAccesses: {
        select: {
          companyId: true,
          unitId: true,
        },
      },

      // ✅ vínculos na empresa
      companyMemberships: {
        where: { isActive: true },
        select: {
          companyId: true,
          role: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // usuário inexistente, sem senha, ou inativo
  if (!user || !user.passwordHash || !user.isActive) {
    throw new AuthError();
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw new AuthError();
  }

  // ✅ Painel aceita ADMIN e BARBER (com regras diferentes)
  if (user.role !== "ADMIN" && user.role !== "BARBER") {
    throw new AuthError("Sem permissão para acessar o painel.");
  }

  /**
   * ✅ Multi-tenant no painel:
   * Se PAINEL_COMPANY_ID estiver definido, ele manda.
   */
  const painelCompanyId = getPainelCompanyIdFromEnv();

  // fallback: primeira membership, depois primeiro adminAccess
  const fallbackCompanyId =
    user.companyMemberships?.[0]?.companyId ??
    user.adminAccesses?.[0]?.companyId ??
    null;

  const companyId =
    painelCompanyId ?? (fallbackCompanyId ? String(fallbackCompanyId) : null);

  if (!companyId) {
    throw new AuthError("Usuário sem empresa vinculada.");
  }

  // Se ENV existe, exige match
  if (painelCompanyId && String(companyId) !== painelCompanyId) {
    throw new AuthError("missing_company");
  }

  const membershipForCompany =
    user.companyMemberships?.find(
      (m) => String(m.companyId) === String(companyId),
    ) ?? null;

  const hasMembershipForCompany = !!membershipForCompany;

  const accessForCompany =
    user.adminAccesses?.find(
      (a) => String(a.companyId) === String(companyId),
    ) ?? null;

  // Em tenant fixo, exige vínculo na company (membership OU adminAccess)
  if (painelCompanyId) {
    if (!hasMembershipForCompany && !accessForCompany) {
      throw new AuthError("Sem permissão para acessar esta empresa.");
    }
  }

  // ===== Regras ADMIN =====
  if (user.role === "ADMIN") {
    // ✅ owner por company (alinha com admin-permissions.ts)
    const isOwner = String(membershipForCompany?.role ?? "") === "OWNER";

    // Admin não-dono: precisa de access na company + unitId
    if (!isOwner) {
      if (!accessForCompany) {
        throw new AuthError("Admin sem acesso configurado para esta empresa.");
      }
      if (!accessForCompany.unitId) {
        throw new AuthError(
          "Admin sem unidade vinculada. Vincule uma unidade.",
        );
      }
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isOwner,
      companyId: String(companyId),
      unitId: accessForCompany?.unitId ? String(accessForCompany.unitId) : null,
    };
  }

  // ===== Regras BARBER =====
  // Para BARBER, não exigimos adminAccess/unitId.
  // Mas exigimos vínculo de membership na empresa como STAFF.
  const hasStaffMembershipForCompany =
    String(membershipForCompany?.role ?? "") === "STAFF";

  if (!hasStaffMembershipForCompany) {
    throw new AuthError("Sem permissão para acessar esta empresa.");
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isOwner: false,
    companyId: String(companyId),
    unitId: null,
  };
}

/**
 * Wrapper compatível
 */
export async function loginWithCredentials(
  email: string,
  password: string,
): Promise<AuthenticatedUser> {
  const { prisma } = await import("@/lib/prisma");
  return loginWithCredentialsWithPrisma(prisma as any, email, password);
}
