"use server";

import { redirect } from "next/navigation";
import { loginWithCredentials, AuthError } from "@/lib/auth";
import {
  createPainelSessionCookie,
  clearPainelSessionCookie,
} from "@/lib/painel-session";

/**
 * Regras do painel (barbeiro / admin)
 * (No próximo passo, essa função interna vira um service em /src/server/services/auth.service.ts)
 */
async function runPainelLogin(email: string, password: string) {
  const user = await loginWithCredentials(email, password);

  // ✅ Permite só ADMIN e BARBER acessarem o painel
  if (user.role !== "ADMIN" && user.role !== "BARBER") {
    redirect("/painel/login?error=permissao");
  }

  // cria cookie de sessão seguro
  await createPainelSessionCookie(user);

  // redireciona conforme o papel
  if (user.role === "ADMIN") {
    redirect("/admin/dashboard");
  }

  // aqui sabemos que é BARBER
  redirect("/barber/dashboard");
}

/**
 * Login do painel (barbeiro / admin)
 */
export async function loginPainel(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await runPainelLogin(email, password);
  } catch (error: any) {
    // 👇 NÃO interceptar redirects do Next
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
      redirect("/painel/login?error=credenciais");
    }

    console.error("Erro inesperado no login do painel:", error);
    redirect("/painel/login?error=desconhecido");
  }
}

/**
 * Logout do painel
 */
export async function logoutPainel() {
  await clearPainelSessionCookie();
  redirect("/painel/login");
}
