// src/lib/admin-permissions.ts
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";
import { getCurrentPainelUser } from "./painel-session";

export type AdminModule =
  | "DASHBOARD"
  | "REPORTS"
  | "APPOINTMENTS"
  | "CHECKOUT"
  | "CLIENTS"
  | "CLIENT_LEVELS"
  | "PROFESSIONALS"
  | "SERVICES"
  | "REVIEWS"
  | "PRODUCTS"
  | "FINANCE"
  | "SETTINGS";

export type AdminWithPermissions = {
  id: string;
  name: string;
  email: string;

  // ✅ multi-tenant
  companyId: string;

  // ✅ papel dentro da company (via CompanyMember)
  isOwner: boolean;
  modules: AdminModule[];

  // ✅ multi-unidade
  unitId: string | null;
  canSeeAllUnits: boolean;
};

export const ALL_ADMIN_MODULES: AdminModule[] = [
  "DASHBOARD",
  "REPORTS",
  "APPOINTMENTS",
  "CHECKOUT",
  "CLIENTS",
  "CLIENT_LEVELS",
  "PROFESSIONALS",
  "SERVICES",
  "REVIEWS",
  "PRODUCTS",
  "FINANCE",
  "SETTINGS",
];

export type AdminPermissionKey =
  | "canAccessDashboard"
  | "canAccessReports"
  | "canAccessAppointments"
  | "canAccessCheckout"
  | "canAccessClients"
  | "canAccessClientLevels"
  | "canAccessProfessionals"
  | "canAccessServices"
  | "canAccessReviews"
  | "canAccessProducts"
  | "canAccessFinance"
  | "canAccessSettings";

type AdminAccess = {
  unitId: string | null;

  canAccessDashboard: boolean;
  canAccessReports: boolean;

  canAccessAppointments: boolean;
  canAccessCheckout: boolean;
  canAccessClients: boolean;
  canAccessClientLevels: boolean;
  canAccessProfessionals: boolean;
  canAccessServices: boolean;
  canAccessReviews: boolean;
  canAccessProducts: boolean;
  canAccessFinance: boolean;
  canAccessSettings: boolean;
};

function deriveModulesFromAdminAccess(
  access: AdminAccess | null | undefined,
): AdminModule[] {
  if (!access) return [];

  const modules: AdminModule[] = [];

  if (access.canAccessDashboard) modules.push("DASHBOARD");
  if (access.canAccessReports) modules.push("REPORTS");

  if (access.canAccessAppointments) modules.push("APPOINTMENTS");
  if (access.canAccessCheckout) modules.push("CHECKOUT");
  if (access.canAccessClients) modules.push("CLIENTS");
  if (access.canAccessClientLevels) modules.push("CLIENT_LEVELS");
  if (access.canAccessProfessionals) modules.push("PROFESSIONALS");
  if (access.canAccessServices) modules.push("SERVICES");
  if (access.canAccessReviews) modules.push("REVIEWS");
  if (access.canAccessProducts) modules.push("PRODUCTS");
  if (access.canAccessFinance) modules.push("FINANCE");
  if (access.canAccessSettings) modules.push("SETTINGS");

  return modules;
}

/**
 * 🔑 Fonte da verdade do tenant do painel (ENV)
 * - Quando definido: single-tenant e toda permissão/membership deve bater nele.
 * - Quando não definido: mantém compat (resolve company via membership).
 */
function getPainelCompanyIdFromEnv(): string | null {
  const raw = process.env.PAINEL_COMPANY_ID;
  const companyId = raw?.trim();
  return companyId && companyId.length > 0 ? companyId : null;
}

/**
 * Resolve o tenant (company) do admin.
 * Regras:
 * 1) Se PAINEL_COMPANY_ID existir: ele manda (e valida membership nessa company).
 * 2) Caso contrário: usa companyId do token do painel (payload.companyId).
 * 3) Caso ainda não tenha: fallback compat por membership "primeira ativa".
 */
async function resolveCompanyContext(userId: string, tokenCompanyId?: string) {
  const envCompanyId = getPainelCompanyIdFromEnv();
  const companyId =
    envCompanyId ?? (tokenCompanyId ? String(tokenCompanyId) : null);

  if (companyId) {
    return prisma.companyMember.findFirst({
      where: {
        userId,
        isActive: true,
        companyId, // ✅ tenant obrigatório quando conhecido
      },
      select: {
        companyId: true,
        role: true,
      },
    });
  }

  // compat: sem ENV e sem companyId no token, pega a primeira membership ativa
  return prisma.companyMember.findFirst({
    where: { userId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: {
      companyId: true,
      role: true,
    },
  });
}

/**
 * Carrega permissões do admin dentro da company atual.
 * (Evita depender do nome do relation no User e fica tenant-safe)
 */
async function resolveAdminAccess(
  userId: string,
  companyId: string,
): Promise<AdminAccess | null> {
  // ✅ select tipado (sem "as any")
  const select = {
    unitId: true,

    canAccessDashboard: true,
    canAccessReports: true,

    canAccessAppointments: true,
    canAccessCheckout: true,
    canAccessClients: true,
    canAccessClientLevels: true,
    canAccessProfessionals: true,
    canAccessServices: true,
    canAccessReviews: true,
    canAccessProducts: true,
    canAccessFinance: true,
    canAccessSettings: true,
  } satisfies Prisma.AdminAccessSelect;

  const access = await prisma.adminAccess.findFirst({
    where: { userId, companyId },
    select,
  });

  // Prisma retorna exatamente os campos acima, ou null
  return access as AdminAccess | null;
}

/**
 * Garante que uma unit pertence à company atual.
 * Se não pertencer, retorna null (protege contra cross-tenant).
 */
async function validateUnitBelongsToCompany(
  unitId: string | null,
  companyId: string,
): Promise<string | null> {
  if (!unitId) return null;

  const found = await prisma.unit.findFirst({
    where: { id: unitId, companyId },
    select: { id: true },
  });

  return found?.id ?? null;
}

/**
 * Versão "FORTE": exige admin logado e ativo.
 */
export async function requireAdminWithPermissions(): Promise<AdminWithPermissions> {
  const payload = await getCurrentPainelUser();

  if (!payload) redirect("/painel/login");
  if (payload.role !== "ADMIN") redirect("/painel/login?error=permissao");

  // ✅ Em modo tenant fixo, o payload já foi validado contra o ENV no verifySessionToken.
  // Ainda assim, pegamos o companyId do payload para scoping e para compat.
  const tokenCompanyId = payload.companyId
    ? String(payload.companyId)
    : undefined;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) redirect("/painel/login");

  // ✅ resolve membership SEMPRE scoping por company quando possível
  const membership = await resolveCompanyContext(user.id, tokenCompanyId);
  if (!membership?.companyId) redirect("/painel/login?error=permissao");

  const companyId = String(membership.companyId);
  const membershipRole = String(membership.role ?? "");
  const isOwner = membershipRole === "OWNER";

  // ✅ Owner: acesso total na company, vê todas as unidades
  if (isOwner) {
    return {
      id: user.id,
      name: user.name ?? payload.name ?? "",
      email: user.email ?? payload.email,
      companyId,
      isOwner: true,
      modules: ALL_ADMIN_MODULES,

      unitId: null,
      canSeeAllUnits: true,
    };
  }

  // ✅ Não-owner: precisa existir um AdminAccess para ESTE companyId
  const adminAccess = await resolveAdminAccess(user.id, companyId);
  if (!adminAccess) {
    redirect("/painel/login?error=permissao");
  }

  // unitId vindo do adminAccess (por company)
  let unitId: string | null = adminAccess.unitId ?? null;

  // blindagem: unit precisa ser da mesma company
  unitId = await validateUnitBelongsToCompany(unitId, companyId);

  // regra multi-unidade: admin não-owner precisa ter unitId válido
  if (!unitId) {
    redirect("/painel/login?error=permissao");
  }

  // ✅ Default deny: se não tem flags, não tem módulos
  const modules = deriveModulesFromAdminAccess(adminAccess);

  return {
    id: user.id,
    name: user.name ?? payload.name ?? "",
    email: user.email ?? payload.email,
    companyId,
    isOwner: false,
    modules,

    unitId,
    canSeeAllUnits: false,
  };
}

/**
 * Versão "SUAVE": NÃO redireciona.
 */
export async function getOptionalAdminWithPermissions(): Promise<AdminWithPermissions | null> {
  const payload = await getCurrentPainelUser();
  if (!payload || payload.role !== "ADMIN") return null;

  const tokenCompanyId = payload.companyId
    ? String(payload.companyId)
    : undefined;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) return null;

  const membership = await resolveCompanyContext(user.id, tokenCompanyId);
  if (!membership?.companyId) return null;

  const companyId = String(membership.companyId);
  const membershipRole = String(membership.role ?? "");
  const isOwner = membershipRole === "OWNER";

  if (isOwner) {
    return {
      id: user.id,
      name: user.name ?? payload.name ?? "",
      email: user.email ?? payload.email,
      companyId,
      isOwner: true,
      modules: ALL_ADMIN_MODULES,

      unitId: null,
      canSeeAllUnits: true,
    };
  }

  const adminAccess = await resolveAdminAccess(user.id, companyId);
  if (!adminAccess) return null;

  let unitId: string | null = adminAccess.unitId ?? null;
  unitId = await validateUnitBelongsToCompany(unitId, companyId);

  if (!unitId) return null;

  const modules = deriveModulesFromAdminAccess(adminAccess);

  return {
    id: user.id,
    name: user.name ?? payload.name ?? "",
    email: user.email ?? payload.email,
    companyId,
    isOwner: false,
    modules,

    unitId,
    canSeeAllUnits: false,
  };
}

/**
 * Calcula rota padrão do admin baseado nas permissões.
 */
export function getAdminDefaultPath(admin: AdminWithPermissions): string {
  const priority: { module: AdminModule; path: string }[] = [
    { module: "DASHBOARD", path: "/admin/dashboard" },
    { module: "REPORTS", path: "/admin/reports" },

    { module: "APPOINTMENTS", path: "/admin/appointments" },
    { module: "CHECKOUT", path: "/admin/checkout" },
    { module: "CLIENTS", path: "/admin/clients" },
    { module: "CLIENT_LEVELS", path: "/admin/client-levels" },
    { module: "PROFESSIONALS", path: "/admin/professionals" },
    { module: "SERVICES", path: "/admin/services" },
    { module: "REVIEWS", path: "/admin/reviews" },
    { module: "PRODUCTS", path: "/admin/products" },
    { module: "FINANCE", path: "/admin/finance" },
    { module: "SETTINGS", path: "/admin/settings" },
  ];

  const found = priority.find((item) => admin.modules.includes(item.module));
  return found?.path ?? "/painel/login?error=permissao";
}

/**
 * Garante acesso a um módulo.
 */
export async function requireAdminForModule(module: AdminModule) {
  const admin = await requireAdminWithPermissions();

  if (!admin.modules.includes(module)) {
    redirect(getAdminDefaultPath(admin));
  }

  return admin;
}

/**
 * Compatibilidade antiga:
 * await requireAdminPermission("canAccessDashboard")
 */
export async function requireAdminPermission(
  permissionKey: AdminPermissionKey | string,
) {
  const map: Record<string, AdminModule | undefined> = {
    canAccessDashboard: "DASHBOARD",
    canAccessReports: "REPORTS",

    canAccessAppointments: "APPOINTMENTS",
    canAccessCheckout: "CHECKOUT",
    canAccessClients: "CLIENTS",
    canAccessClientLevels: "CLIENT_LEVELS",
    canAccessProfessionals: "PROFESSIONALS",
    canAccessServices: "SERVICES",
    canAccessReviews: "REVIEWS",
    canAccessProducts: "PRODUCTS",
    canAccessFinance: "FINANCE",
    canAccessSettings: "SETTINGS",
  };

  const module = map[String(permissionKey)];

  if (!module) {
    return requireAdminWithPermissions();
  }

  return requireAdminForModule(module);
}
