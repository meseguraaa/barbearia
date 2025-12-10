// src/lib/admin-permissions.ts
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

import { prisma } from "./prisma";

const SESSION_COOKIE_NAME = "painel_session";

type PainelRole = "CLIENT" | "BARBER" | "ADMIN";

type PainelSessionPayload = {
  sub: string; // id do user
  role: PainelRole;
  email: string;
  name?: string | null;
};

function getJwtSecretKey() {
  const secret = process.env.PAINEL_JWT_SECRET;
  if (!secret) {
    throw new Error("PAINEL_JWT_SECRET não definido no .env");
  }
  return new TextEncoder().encode(secret);
}

export type AdminModule =
  | "DASHBOARD"
  | "APPOINTMENTS"
  | "CHECKOUT"
  | "CLIENTS"
  | "PROFESSIONALS"
  | "SERVICES"
  | "PLANS"
  | "FINANCE"
  | "SETTINGS";

export type AdminWithPermissions = {
  id: string;
  name: string;
  email: string;
  isOwner: boolean;
  modules: AdminModule[];
};

export const ALL_ADMIN_MODULES: AdminModule[] = [
  "DASHBOARD",
  "APPOINTMENTS",
  "CHECKOUT",
  "CLIENTS",
  "PROFESSIONALS",
  "SERVICES",
  "PLANS",
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
  | "canAccessPlans"
  | "canAccessFinance"
  | "canAccessSettings";

// estrutura esperada do adminAccess (ajusta se tiver algum campo a mais)
type AdminAccess = {
  isActive: boolean;
  canAccessDashboard?: boolean;
  canAccessAppointments?: boolean;
  canAccessCheckout?: boolean;
  canAccessClients?: boolean;
  canAccessProfessionals?: boolean;
  canAccessServices?: boolean;
  canAccessPlans?: boolean;
  canAccessFinance?: boolean;
  canAccessSettings?: boolean;
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
  if (access.canAccessPlans) modules.push("PLANS");
  if (access.canAccessFinance) modules.push("FINANCE");
  if (access.canAccessSettings) modules.push("SETTINGS");

  return modules;
}

/**
 * Lê o JWT do cookie painel_session.
 * Se não tiver cookie ou JWT inválido → null (versão "suave").
 */
async function getPainelSessionPayloadSafe(): Promise<PainelSessionPayload | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) return null;

  try {
    const { payload } = await jwtVerify<PainelSessionPayload>(
      sessionToken,
      getJwtSecretKey(),
    );
    return payload;
  } catch (err) {
    console.error("Erro ao verificar painel_session:", err);
    return null;
  }
}

/**
 * Versão "FORTE": exige admin logado e ativo.
 * Usa painel_session (não NextAuth).
 */
export async function requireAdminWithPermissions(): Promise<AdminWithPermissions> {
  const payload = await getPainelSessionPayloadSafe();

  if (!payload) {
    redirect("/admin/login");
  }

  if (payload.role !== "ADMIN") {
    redirect("/admin/login");
  }

  // Carrega o usuário + adminAccess
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: {
      adminAccess: true,
    },
  });

  if (!user || !user.isActive) {
    redirect("/admin/login");
  }

  const isOwner = !!user.isOwner;
  const adminAccess = (user as any).adminAccess as AdminAccess | null;

  // Dono SEMPRE tem acesso a tudo
  if (isOwner) {
    return {
      id: user.id,
      name: user.name ?? payload.name ?? "",
      email: user.email ?? payload.email,
      isOwner: true,
      modules: ALL_ADMIN_MODULES,
    };
  }

  // Se existe registro de adminAccess e ele estiver marcado como inativo
  if (adminAccess && adminAccess.isActive === false) {
    redirect("/admin/login?error=inativo");
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
  };
}

/**
 * Versão "SUAVE": NÃO redireciona.
 * Usada em layout/menu/cabeçalho. Se não tiver admin logado, retorna null.
 */
export async function getOptionalAdminWithPermissions(): Promise<AdminWithPermissions | null> {
  const payload = await getPainelSessionPayloadSafe();
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
  const adminAccess = (user as any).adminAccess as AdminAccess | null;

  if (isOwner) {
    return {
      id: user.id,
      name: user.name ?? payload.name ?? "",
      email: user.email ?? payload.email,
      isOwner: true,
      modules: ALL_ADMIN_MODULES,
    };
  }

  if (adminAccess && adminAccess.isActive === false) {
    return null;
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
    { module: "PLANS", path: "/admin/plans" },
    { module: "FINANCE", path: "/admin/finance" },
    { module: "SETTINGS", path: "/admin/settings" },
  ];

  const found = priority.find((item) => admin.modules.includes(item.module));

  return found?.path ?? "/admin/login";
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
    canAccessPlans: "PLANS",
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
