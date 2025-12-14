// src/app/admin/layout.tsx
import { ReactNode } from "react";
import { AdminNav } from "@/components/admin-nav";
import { requireAdminWithPermissions } from "@/lib/admin-permissions";
import { prisma } from "@/lib/prisma";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const currentAdmin = await requireAdminWithPermissions();

  // ✅ trava extra aqui também (defesa em profundidade)
  // admin não-dono tem que ter unitId
  if (!currentAdmin.canSeeAllUnits && !currentAdmin.unitId) {
    // requireAdminWithPermissions já deve barrar, mas aqui reforça
    // (se quiser, pode só redirect("/painel/login?error=permissao"))
    throw new Error("ADMIN sem unitId. Vincule uma unidade.");
  }

  // ✅ Carrega unidades apenas pro dono (quem pode ver "todas")
  // (admin de unidade não precisa nem enxergar isso)
  const units = currentAdmin.canSeeAllUnits
    ? await prisma.unit.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  // 🔹 Admin ativo: nav fixo na esquerda + conteúdo com padding
  return (
    <div className="min-h-screen bg-background-primary">
      {/* SIDEBAR FIXA (rail que expande no hover) */}
      <AdminNav
        allowedModules={currentAdmin.modules}
        unitId={currentAdmin.unitId}
        canSeeAllUnits={currentAdmin.canSeeAllUnits}
        units={units}
      />

      {/* CONTEÚDO PRINCIPAL DESCOLADO DO MENU */}
      <main className="pl-14">
        <div className="w-full max-w-7xl mx-auto px-4 py-6">{children}</div>
      </main>
    </div>
  );
}
