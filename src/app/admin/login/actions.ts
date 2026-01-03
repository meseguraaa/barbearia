// src/app/admin/login/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import z from "zod";
import bcrypt from "bcryptjs";
import type { AdminPermissionKey } from "@/lib/admin-permissions";
import { cookies, headers } from "next/headers";

// ✅ agora o cookie/JWT é centralizado aqui
import { createPainelSessionCookie } from "@/lib/painel-session";

const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
  companyId: z.string().min(1, "companyId é obrigatório"),
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

async function readCompanyIdFromRequest(): Promise<string | null> {
  // 1) headers (middleware / proxy)
  const h = await headers();
  const headerCompanyId = h.get("x-company-id");
  if (headerCompanyId?.trim()) return headerCompanyId.trim();

  // 2) cookies (contexto salvo)
  const c = await cookies();
  const cookieNames = [
    "companyId",
    "company_id",
    "admin_company_context",
    "company_context",
  ];

  for (const name of cookieNames) {
    const v = c.get(name)?.value;
    if (v?.trim()) return v.trim();
  }

  return null;
}

export async function adminLoginAction(
  formData: FormData,
): Promise<{ error?: string; success?: true; redirectTo?: string }> {
  const rawEmail = String(formData.get("email") ?? "");
  const rawPassword = String(formData.get("password") ?? "");

  // companyId pode vir do form OU de contexto (cookie/header)
  const companyIdFromForm = String(formData.get("companyId") ?? "").trim();
  const companyIdFromContext = await readCompanyIdFromRequest();
  const companyId = (companyIdFromForm || companyIdFromContext || "").trim();

  const parsed = loginSchema.safeParse({
    email: rawEmail,
    password: rawPassword,
    companyId,
  });

  if (!parsed.success) {
    const hasCompanyError = parsed.error.issues.some(
      (i) => String(i.path?.[0]) === "companyId",
    );

    if (hasCompanyError) {
      return {
        error:
          "companyId ausente. Acesse o painel pelo link da sua empresa (ou informe o companyId).",
      };
    }

    return { error: "Credenciais inválidas." };
  }

  const email = parsed.data.email.trim().toLowerCase();
  const password = parsed.data.password;
  const scopedCompanyId = parsed.data.companyId.trim();

  /**
   * ✅ MULTI-TENANT REAL (conforme teu schema):
   * - User NÃO tem companyId
   * - então garantimos a empresa via adminAccesses.some({ companyId })
   */
  const user = await prisma.user.findFirst({
    where: {
      email,
      role: "ADMIN",
      adminAccesses: {
        some: { companyId: scopedCompanyId },
      },
    },
    include: {
      adminAccesses: {
        where: { companyId: scopedCompanyId },
        take: 1, // só precisamos do acesso da empresa atual
      },
    },
  });

  if (!user) {
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

  const isOwner = (user as any).isOwner ?? false;

  // ✅ Acesso da empresa atual (já filtrado por companyId)
  const access = (user as any).adminAccesses?.[0] ?? null;

  // ✅ trava: admin não-dono precisa ter unitId definido no AdminAccess (da empresa atual)
  const unitId = access?.unitId ?? null;

  if (!isOwner && !unitId) {
    return {
      error: "Admin sem unidade vinculada. Vincule uma unidade no AdminAccess.",
    };
  }

  // ✅ sessão do painel com companyId obrigatório
  await createPainelSessionCookie({
    id: user.id,
    role: user.role,
    email: user.email ?? "",
    name: user.name ?? null,

    isOwner,
    unitId,

    companyId: scopedCompanyId,
  } as any);

  // =====================================================
  // DEFINIR PRIMEIRA ROTA PERMITIDA
  // =====================================================
  let redirectTo = "/admin/dashboard";

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
