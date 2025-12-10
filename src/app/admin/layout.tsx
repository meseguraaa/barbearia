// src/app/admin/layout.tsx
import { ReactNode } from "react";
import { AdminNav } from "@/components/admin-nav";
import { getOptionalAdminWithPermissions } from "@/lib/admin-permissions";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const currentAdmin = await getOptionalAdminWithPermissions();

  // 🔹 Sem admin ativo (login, não logado, inativo):
  // não mostra sidebar, deixa a página ocupar tudo
  if (!currentAdmin) {
    return <div className="min-h-screen bg-background-primary">{children}</div>;
  }

  // 🔹 Admin ativo: nav fixo na esquerda + conteúdo com padding
  return (
    <div className="min-h-screen bg-background-primary">
      {/* SIDEBAR FIXA (rail que expande no hover) */}
      <AdminNav allowedModules={currentAdmin.modules} />

      {/* CONTEÚDO PRINCIPAL DESCOLADO DO MENU */}
      <main className="pl-14">
        <div className="w-full max-w-7xl mx-auto px-4 py-6">{children}</div>
      </main>
    </div>
  );
}
