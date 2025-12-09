// app/admin/login/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { SignJWT } from "jose";
import z from "zod";
import bcrypt from "bcryptjs";
import type { AdminPermissionKey } from "@/lib/admin-permissions";

const SESSION_COOKIE_NAME = "painel_session";

type PainelSessionPayload = {
  sub: string;
  role: "CLIENT" | "BARBER" | "ADMIN";
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
    { perm: "canAccessReviews", path: "/admin/reviews" },
    { perm: "canAccessProducts", path: "/admin/products" },
    { perm: "canAccessClients", path: "/admin/clients" },
    { perm: "canAccessFinance", path: "/admin/finance" },
  ];

export async function adminLoginAction(
  formData: FormData,
): Promise<{ error?: string; success?: true; redirectTo?: string }> {
  const raw = {
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const parsed = loginSchema.safeParse({
    email: String(raw.email ?? ""),
    password: String(raw.password ?? ""),
  });

  if (!parsed.success) {
    return { error: "Credenciais inválidas." };
  }

  const email = parsed.data.email.trim().toLowerCase();
  const password = parsed.data.password;

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      adminAccess: true,
    },
  });

  // não existe ou não é ADMIN
  if (!user || user.role !== "ADMIN") {
    return { error: "Credenciais inválidas." };
  }

  // 🚫 Admin inativo não pode logar
  if (!(user as any).isActive) {
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
  // JWT + COOKIE
  // =====================================================
  const payload: PainelSessionPayload = {
    sub: user.id,
    role: "ADMIN",
    email: user.email ?? "",
    name: user.name,
  };

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(getJwtSecretKey());

  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 dias
  });

  // =====================================================
  // DEFINIR PRIMEIRA ROTA PERMITIDA
  // =====================================================
  let redirectTo = "/admin/dashboard";

  const isOwner = (user as any).isOwner ?? false;
  const access = user.adminAccess;

  if (!isOwner && access) {
    for (const item of PERMISSION_REDIRECT_ORDER) {
      if ((access as any)[item.perm]) {
        redirectTo = item.path;
        break;
      }
    }
  }

  // dono cai no dashboard mesmo, que tem acesso total

  return { success: true, redirectTo };
}
