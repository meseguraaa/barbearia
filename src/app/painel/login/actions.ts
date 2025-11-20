"use server";

import { redirect } from "next/navigation";
import { loginWithCredentials, AuthError } from "@/lib/auth";
import {
  createPainelSessionCookie,
  clearPainelSessionCookie,
} from "@/lib/painel-session";

/**
 * Login do painel (barbeiro / admin)
 */
export async function loginPainel(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    const user = await loginWithCredentials(email, password);

    // cria cookie de sessão seguro
    await createPainelSessionCookie(user);

    // redireciona conforme o papel
    if (user.role === "ADMIN") {
      redirect("/admin/dashboard");
    }

    redirect("/barber/dashboard");
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
