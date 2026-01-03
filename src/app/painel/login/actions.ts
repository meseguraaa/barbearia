// src/app/painel/login/actions.ts
"use server";

import { redirect } from "next/navigation";
import { loginWithCredentials, AuthError } from "@/lib/auth";
import {
  createPainelSessionCookie,
  clearPainelSessionCookie,
} from "@/lib/painel-session";
import { prisma } from "@/lib/prisma";

/**
 * 🔑 Fonte da verdade do tenant do painel (ENV)
 * - Quando definido, o painel fica "single-tenant": login deve bater com esse companyId.
 */
function getPainelCompanyIdFromEnv(): string | null {
  const raw = process.env.PAINEL_COMPANY_ID;
  const companyId = raw?.trim();
  return companyId && companyId.length > 0 ? companyId : null;
}

/**
 * Login do painel:
 * - ADMIN: cria painel_session e vai para /admin/dashboard
 * - BARBER (profissional): exige vínculo STAFF em company_members e vai para /barber
 */
async function runPainelLogin(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPassword = password.trim();

  if (!normalizedEmail || !normalizedPassword) {
    redirect("/painel/login?error=credenciais");
  }

  const user = await loginWithCredentials(normalizedEmail, normalizedPassword);

  const painelCompanyId = getPainelCompanyIdFromEnv();

  // ✅ ADMIN: painel administrativo
  if (user.role === "ADMIN") {
    // Valida vínculo ANTES de criar cookie (evita loop/erro no /admin)
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        companyMemberships: {
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
          select: { companyId: true, role: true },
        },
        adminAccesses: {
          select: { companyId: true, unitId: true },
        },
      },
    });

    if (!dbUser) redirect("/painel/login?error=permissao");

    // Decide company alvo (mesma regra do painel-session.ts)
    const fallbackCompanyId =
      dbUser.companyMemberships?.[0]?.companyId ??
      dbUser.adminAccesses?.[0]?.companyId ??
      null;

    const companyId =
      painelCompanyId ?? (fallbackCompanyId ? String(fallbackCompanyId) : null);

    if (!companyId) {
      if (painelCompanyId) redirect("/painel/login?error=missing_company");
      redirect("/painel/login?error=permissao");
    }

    // tenant fixo: exige vínculo nessa empresa
    if (painelCompanyId) {
      const hasMembership = !!dbUser.companyMemberships?.some(
        (m) => String(m.companyId) === painelCompanyId,
      );
      const hasAccess = !!dbUser.adminAccesses?.some(
        (a) => String(a.companyId) === painelCompanyId,
      );

      if (!hasMembership && !hasAccess) {
        redirect("/painel/login?error=missing_company");
      }
    }

    // owner por membership na company
    const membershipForCompany =
      dbUser.companyMemberships?.find(
        (m) => String(m.companyId) === String(companyId),
      ) ?? null;

    const isOwner = String(membershipForCompany?.role ?? "") === "OWNER";

    // não-owner precisa ter AdminAccess nessa company e unitId
    if (!isOwner) {
      const accessForCompany =
        dbUser.adminAccesses?.find(
          (a) => String(a.companyId) === String(companyId),
        ) ?? null;

      if (!accessForCompany) {
        redirect("/painel/login?error=permissao");
      }

      if (!accessForCompany.unitId) {
        redirect("/painel/login?error=permissao");
      }
    }

    await createPainelSessionCookie(user);
    redirect("/admin/dashboard");
  }

  // ✅ Profissional: User.role = BARBER (não STAFF)
  if (user.role === "BARBER") {
    // precisa ter vínculo ativo como STAFF na empresa (company_members)
    const member = await prisma.companyMember.findFirst({
      where: {
        userId: user.id,
        isActive: true,
        role: "STAFF",
        ...(painelCompanyId ? { companyId: painelCompanyId } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: { companyId: true },
    });

    if (!member?.companyId) {
      // se tenant fixo, erro mais específico
      if (painelCompanyId) redirect("/painel/login?error=missing_company");
      redirect("/painel/login?error=permissao");
    }

    // valida que existe registro de Barber ativo nessa empresa
    const barber = await prisma.barber.findFirst({
      where: {
        userId: user.id,
        companyId: member.companyId,
        isActive: true,
      },
      select: { id: true },
    });

    if (!barber) {
      redirect("/painel/login?error=permissao");
    }

    // ✅ cria cookie (permitido para BARBER)
    await createPainelSessionCookie(user);

    redirect("/barber");
  }

  // CLIENT/OUTROS: não entram no /painel
  redirect("/painel/login?error=permissao");
}

export async function loginPainel(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await runPainelLogin(email, password);
  } catch (error: any) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof error.digest === "string" &&
      error.digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }

    if (error instanceof AuthError) {
      const msg = String(error?.message ?? "");

      if (msg === "missing_company") {
        redirect("/painel/login?error=missing_company");
      }

      if (
        msg.toLowerCase().includes("permiss") ||
        msg.toLowerCase().includes("sem permissão") ||
        msg.toLowerCase().includes("sem empresa") ||
        msg.toLowerCase().includes("vinculad") ||
        msg.toLowerCase().includes("acesso")
      ) {
        redirect("/painel/login?error=permissao");
      }

      redirect("/painel/login?error=credenciais");
    }

    const msg = String(error?.message ?? "");

    const looksLikeMissingCompany =
      msg === "missing_company" ||
      msg.includes("missing_company") ||
      msg.includes("PAINEL_COMPANY_ID");

    console.error("Erro inesperado no login do painel:", {
      message: msg,
      error,
    });

    if (looksLikeMissingCompany) {
      redirect("/painel/login?error=missing_company");
    }

    if (msg.toLowerCase().includes("permiss")) {
      redirect("/painel/login?error=permissao");
    }

    redirect("/painel/login?error=desconhecido");
  }
}

export async function logoutPainel() {
  await clearPainelSessionCookie();
  redirect("/painel/login");
}
