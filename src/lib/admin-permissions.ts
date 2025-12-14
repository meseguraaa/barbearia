// src/lib/admin-permissions.ts
import { redirect } from "next/navigation";

import { prisma } from "./prisma";
import { getCurrentPainelUser } from "./painel-session";

export type AdminModule =
  | "DASHBOARD"
  | "APPOINTMENTS"
  | "CHECKOUT"
  | "CLIENTS"
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

  // já existia
  isOwner: boolean;
  modules: AdminModule[];

  // ✅ multi-unidade (novo)
  unitId: string | null;
  canSeeAllUnits: boolean;
};

export const ALL_ADMIN_MODULES: AdminModule[] = [
  "DASHBOARD",
  "APPOINTMENTS",
  "CHECKOUT",
  "CLIENTS",
  "PROFESSIONALS",
  "SERVICES",
  "REVIEWS",
  "PRODUCTS",
  "FINANCE",
  "SETTINGS",
];

// 🔹 Tipo das chaves de permissão usadas no sistema (para o login, settings etc.)
export type AdminPermissionKey =
  | "canAccessDashboard"
  | "canAccessAppointments"
  | "canAccessCheckout"
  | "canAccessClients"
  | "canAccessProfessionals"
  | "canAccessServices"
  | "canAccessReviews"
  | "canAccessProducts"
  | "canAccessFinance"
  | "canAccessSettings";

type AdminAccess = {
  // ✅ multi-unidade (se já tiver no schema/migration)
  unitId?: string | null;

  canAccessDashboard?: boolean;
  canAccessAppointments?: boolean;
  canAccessCheckout?: boolean;
  canAccessClients?: boolean;
  canAccessProfessionals?: boolean;
  canAccessServices?: boolean;
  canAccessFinance?: boolean;

  // (no seu schema atual existem também:)
  canAccessReviews?: boolean;
  canAccessProducts?: boolean;
};

/**
 * Mapeia os booleans de adminAccess para a lista de módulos.
 */
function deriveModulesFromAdminAccess(
  access: AdminAccess | null | undefined,
): AdminModule[] {
  if (!access) return [];

  const modules: AdminModule[] = [];

  if (access.canAccessDashboard) modules.push("DASHBOARD");
  if (access.canAccessAppointments) modules.push("APPOINTMENTS");
  if (access.canAccessCheckout) modules.push("CHECKOUT");
  if (access.canAccessClients) modules.push("CLIENTS");
  if (access.canAccessProfessionals) modules.push("PROFESSIONALS");
  if (access.canAccessServices) modules.push("SERVICES");
  if (access.canAccessReviews) modules.push("REVIEWS");
  if (access.canAccessProducts) modules.push("PRODUCTS");
  if (access.canAccessFinance) modules.push("FINANCE");
  // SETTINGS é regra “de sistema” (geralmente só dono ou admin especial)
  // Se você quiser SETTINGS por permissão, aí a gente adiciona no schema depois.

  return modules;
}

/**
 * Versão "FORTE": exige admin logado e ativo.
 * Usa painel_session (não NextAuth).
 */
export async function requireAdminWithPermissions(): Promise<AdminWithPermissions> {
  const payload = await getCurrentPainelUser();

  if (!payload) {
    redirect("/painel/login");
  }

  if (payload.role !== "ADMIN") {
    redirect("/painel/login?error=permissao");
  }

  // Carrega o usuário + adminAccess
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: {
      adminAccess: true,
    },
  });

  if (!user || !user.isActive) {
    redirect("/painel/login");
  }

  const isOwner = !!user.isOwner;
  const adminAccess = user.adminAccess as unknown as AdminAccess | null;
  const unitId = adminAccess?.unitId ?? null;

  // ✅ Regra multi-unidade:
  // - Dono vê tudo
  // - Admin não-dono precisa ter unitId (senão não entra no painel)
  if (!isOwner && !unitId) {
    redirect("/painel/login?error=permissao");
  }

  // Dono SEMPRE tem acesso a tudo
  if (isOwner) {
    return {
      id: user.id,
      name: user.name ?? payload.name ?? "",
      email: user.email ?? payload.email,
      isOwner: true,
      modules: ALL_ADMIN_MODULES,

      unitId: null,
      canSeeAllUnits: true,
    };
  }

  const modulesFromAccess = deriveModulesFromAdminAccess(adminAccess);

  // Se não tiver nada configurado, libera tudo (ou ajusta se quiser mais restrito)
  const modules =
    modulesFromAccess.length > 0 ? modulesFromAccess : ALL_ADMIN_MODULES;

  return {
    id: user.id,
    name: user.name ?? payload.name ?? "",
    email: user.email ?? payload.email,
    isOwner: false,
    modules,

    unitId,
    canSeeAllUnits: false,
  };
}

/**
 * Versão "SUAVE": NÃO redireciona.
 * Usada em layout/menu/cabeçalho. Se não tiver admin logado, retorna null.
 */
export async function getOptionalAdminWithPermissions(): Promise<AdminWithPermissions | null> {
  const payload = await getCurrentPainelUser();

  if (!payload || payload.role !== "ADMIN") {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: {
      adminAccess: true,
    },
  });

  if (!user || !user.isActive) {
    return null;
  }

  const isOwner = !!user.isOwner;
  const adminAccess = user.adminAccess as unknown as AdminAccess | null;
  const unitId = adminAccess?.unitId ?? null;

  if (!isOwner && !unitId) {
    return null;
  }

  if (isOwner) {
    return {
      id: user.id,
      name: user.name ?? payload.name ?? "",
      email: user.email ?? payload.email,
      isOwner: true,
      modules: ALL_ADMIN_MODULES,

      unitId: null,
      canSeeAllUnits: true,
    };
  }

  const modulesFromAccess = deriveModulesFromAdminAccess(adminAccess);

  const modules =
    modulesFromAccess.length > 0 ? modulesFromAccess : ALL_ADMIN_MODULES;

  return {
    id: user.id,
    name: user.name ?? payload.name ?? "",
    email: user.email ?? payload.email,
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
    { module: "APPOINTMENTS", path: "/admin/appointments" },
    { module: "CHECKOUT", path: "/admin/checkout" },
    { module: "CLIENTS", path: "/admin/clients" },
    { module: "PROFESSIONALS", path: "/admin/professionals" },
    { module: "SERVICES", path: "/admin/services" },
    { module: "REVIEWS", path: "/admin/reviews" },
    { module: "PRODUCTS", path: "/admin/products" },
    { module: "FINANCE", path: "/admin/finance" },

    { module: "SETTINGS", path: "/admin/settings" },
  ];

  const found = priority.find((item) => admin.modules.includes(item.module));

  return found?.path ?? "/painel/login";
}

/**
 * Garante acesso a um módulo. Se não tiver, redireciona para a primeira rota permitida.
 */
export async function requireAdminForModule(module: AdminModule) {
  const admin = await requireAdminWithPermissions();

  if (!admin.modules.includes(module)) {
    const target = getAdminDefaultPath(admin);
    redirect(target);
  }

  return admin;
}

/**
 * Compatibilidade antiga:
 * await requireAdminPermission("canAccessDashboard")
 */
export async function requireAdminPermission(permissionKey: string) {
  const map: Record<string, AdminModule | undefined> = {
    canAccessDashboard: "DASHBOARD",
    canAccessAppointments: "APPOINTMENTS",
    canAccessCheckout: "CHECKOUT",
    canAccessClients: "CLIENTS",
    canAccessProfessionals: "PROFESSIONALS",
    canAccessServices: "SERVICES",
    canAccessReviews: "REVIEWS",
    canAccessProducts: "PRODUCTS",
    canAccessFinance: "FINANCE",
    canAccessSettings: "SETTINGS",
  };

  const module = map[permissionKey];

  if (!module) {
    // chave desconhecida → só garante que é admin
    return requireAdminWithPermissions();
  }

  return requireAdminForModule(module);
}
