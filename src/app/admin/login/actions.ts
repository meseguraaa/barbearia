// app/admin/login/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import z from "zod";
import bcrypt from "bcryptjs";
import type { AdminPermissionKey } from "@/lib/admin-permissions";

// ✅ agora o cookie/JWT é centralizado aqui
import { createPainelSessionCookie } from "@/lib/painel-session";

const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

// ordem de prioridade para redirecionar após login
const PERMISSION_REDIRECT_ORDER: { perm: AdminPermissionKey; path: string }[] =
  [
    { perm: "canAccessDashboard", path: "/admin/dashboard" },
    { perm: "canAccessCheckout", path: "/admin/checkout" },
    { perm: "canAccessAppointments", path: "/admin/appointments" },
    { perm: "canAccessProfessionals", path: "/admin/professionals" },
    { perm: "canAccessServices", path: "/admin/services" },
    { perm: "canAccessClients", path: "/admin/clients" },
    { perm: "canAccessReviews", path: "/admin/reviews" },
    { perm: "canAccessProducts", path: "/admin/products" },
    { perm: "canAccessFinance", path: "/admin/finance" },
    { perm: "canAccessSettings", path: "/admin/settings" },
  ];

export async function adminLoginAction(
  formData: FormData,
): Promise<{ error?: string; success?: true; redirectTo?: string }> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    return { error: "Credenciais inválidas." };
  }

  const email = parsed.data.email.trim().toLowerCase();
  const password = parsed.data.password;

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      adminAccess: true, // ✅ aqui vem unitId (se você colocou no AdminAccess)
    },
  });

  // não existe ou não é ADMIN
  if (!user || user.role !== "ADMIN") {
    return { error: "Credenciais inválidas." };
  }

  // 🚫 Admin inativo não pode logar (se isActive não existir, assume ativo)
  const isActive = (user as any).isActive;
  if (isActive === false) {
    return { error: "Este administrador está inativo." };
  }

  const passwordHash = (user as any).passwordHash as string | null | undefined;
  if (!passwordHash) {
    return { error: "Credenciais inválidas." };
  }

  const passwordOk = await bcrypt.compare(password, passwordHash);
  if (!passwordOk) {
    return { error: "Credenciais inválidas." };
  }

  // =====================================================
  // ✅ COOKIE DO PAINEL (com unitId + canSeeAllUnits)
  // - centralizado no src/lib/painel-session.ts
  // - para ADMIN, ele consegue resolver unitId via DB se necessário
  // =====================================================
  const isOwner = (user as any).isOwner ?? false;

  // ✅ trava: admin não-dono precisa ter unitId definido no AdminAccess
  const unitId = (user as any)?.adminAccess?.unitId ?? null;

  if (!isOwner && !unitId) {
    return {
      error: "Admin sem unidade vinculada. Vincule uma unidade no AdminAccess.",
    };
  }

  // Monta um "AuthenticatedUser-like" (não precisa casar 100% no runtime)
  await createPainelSessionCookie({
    id: user.id,
    role: user.role,
    email: user.email ?? "",
    name: user.name ?? null,

    // se existir no teu schema/auth, isso ajuda na resolução
    isOwner,

    // se adminAccess tiver unitId, já ajuda também (mas o painel-session consegue buscar no DB)
    unitId,
  } as any);

  // =====================================================
  // DEFINIR PRIMEIRA ROTA PERMITIDA
  // =====================================================
  let redirectTo = "/admin/dashboard";

  const access = user.adminAccess;

  // dono cai no dashboard (acesso total)
  if (!isOwner && access) {
    for (const item of PERMISSION_REDIRECT_ORDER) {
      if ((access as any)[item.perm]) {
        redirectTo = item.path;
        break;
      }
    }
  }

  return { success: true, redirectTo };
}
