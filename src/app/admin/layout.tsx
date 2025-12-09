// src/app/admin/layout.tsx
import { ReactNode } from "react";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { AdminNav } from "@/components/admin-nav/admin-nav";

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

async function getCurrentActiveAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    // sem cookie → trata como não logado
    return null;
  }

  try {
    const secret = getJwtSecretKey();
    const { payload } = await jwtVerify(token, secret);
    const data = payload as PainelSessionPayload;

    if (data.role !== "ADMIN") {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: data.sub },
    });

    if (!user || user.role !== "ADMIN") {
      return null;
    }

    // se estiver inativo, não considera como logado para o layout
    if (!(user as any).isActive) {
      return null;
    }

    return user;
  } catch {
    // token inválido / expirado → trata como não logado
    return null;
  }
}

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const currentAdmin = await getCurrentActiveAdmin();

  // 🔹 Sem admin ativo (login, inativo, não logado):
  // não mostra sidebar, só o conteúdo (ex: /admin/login)
  if (!currentAdmin) {
    return (
      <div className="min-h-screen flex bg-background-primary">
        <div className="flex-1 flex flex-col">
          <main className="w-full max-w-7xl mx-auto px-4 py-6">{children}</main>
        </div>
      </div>
    );
  }

  // 🔹 Admin ativo: layout completo com menu lateral
  return (
    <div className="min-h-screen flex bg-background-primary">
      {/* SIDEBAR / MENU ADMIN */}
      <AdminNav />

      {/* CONTEÚDO PRINCIPAL */}
      <div className="flex-1 flex flex-col">
        <main className="w-full max-w-7xl mx-auto px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
