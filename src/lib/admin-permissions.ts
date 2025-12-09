// src/lib/admin-permissions.ts
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

// ====== TIPOS DE PERMISSÃO ======
export type AdminPermissionKey =
  | "canAccessDashboard"
  | "canAccessCheckout"
  | "canAccessAppointments"
  | "canAccessProfessionals"
  | "canAccessServices"
  | "canAccessReviews"
  | "canAccessProducts"
  | "canAccessClients"
  | "canAccessFinance";

// ====== MESMO ESQUEMA DO middleware.ts ======
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

// Lê o cookie do painel e garante que é ADMIN
async function getCurrentAdminFromCookie(): Promise<PainelSessionPayload> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    // sem sessão → manda pro login de admin
    redirect("/admin/login");
  }

  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    const sessionPayload = payload as PainelSessionPayload;

    if (sessionPayload.role !== "ADMIN") {
      redirect("/admin/login?error=permissao");
    }

    return sessionPayload;
  } catch {
    // token inválido / expirado
    redirect("/admin/login");
  }
}

// ====== FUNÇÃO USADA NAS PÁGINAS ADMIN ======
export async function requireAdminPermission(permission: AdminPermissionKey) {
  const payload = await getCurrentAdminFromCookie();
  const userId = payload.sub;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      adminAccess: true, // tabela AdminAccess com os booleans
    },
  });

  // não achou ou não é ADMIN → fora
  if (!user || user.role !== "ADMIN") {
    redirect("/admin/login?error=permissao");
  }

  // 🚫 Admin inativo NÃO pode acessar nenhuma página admin
  if (!(user as any).isActive) {
    redirect("/admin/login?error=inativo");
  }

  const isOwner = !!user.isOwner;
  const access = user.adminAccess;

  // Dono tem acesso total
  if (!isOwner) {
    // Se não tiver registro de adminAccess ou a perm específica for false → bloqueia
    if (!access || !(access as any)[permission]) {
      // sem permissão pra esse módulo → volta pra home do admin
      redirect("/admin/dashboard");
    }
  }

  return {
    user,
    adminAccess: access,
    isOwner,
  };
}
