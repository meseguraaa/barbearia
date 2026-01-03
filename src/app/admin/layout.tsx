// src/app/admin/layout.tsx
import { ReactNode } from "react";
import { AdminNav } from "@/components/admin-nav";
import { requireAdminWithPermissions } from "@/lib/admin-permissions";
import type { AdminModule } from "@/lib/admin-permissions";
import { prisma } from "@/lib/prisma";

// ✅ Evita cache entre tenants no App Router (muito importante em multi-tenant)
export const dynamic = "force-dynamic";

type AdminContext = {
  companyId?: string;
  unitId?: string | null;
  canSeeAllUnits: boolean;

  // ✅ agora tipado corretamente (inclui REPORTS)
  modules: AdminModule[];
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const currentAdmin = (await requireAdminWithPermissions()) as AdminContext;

  // ✅ MULTI-TENANT HARD STOP
  const companyId = currentAdmin.companyId?.trim();
  if (!companyId) {
    throw new Error(
      "ADMIN sem companyId. Este painel é multi-tenant: vincule o admin a uma empresa (companyId).",
    );
  }

  // ✅ defesa em profundidade:
  // admin que não pode ver todas as unidades precisa ter unitId
  if (!currentAdmin.canSeeAllUnits && !currentAdmin.unitId) {
    throw new Error("ADMIN sem unitId. Vincule uma unidade.");
  }

  // ✅ Unidades SEMPRE scopo por companyId
  const units = currentAdmin.canSeeAllUnits
    ? await prisma.unit.findMany({
        where: {
          companyId,
          isActive: true,
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : currentAdmin.unitId
      ? await prisma.unit.findMany({
          where: {
            id: currentAdmin.unitId,
            companyId,
            isActive: true,
          },
          select: { id: true, name: true },
        })
      : [];

  // ✅ Se admin de unidade tem unitId mas não retornou nada,
  // significa que a unidade não pertence ao companyId (ou não existe / inativa).
  if (
    !currentAdmin.canSeeAllUnits &&
    currentAdmin.unitId &&
    units.length === 0
  ) {
    throw new Error(
      "A unidade vinculada ao admin não pertence à empresa (companyId), está inativa ou não existe.",
    );
  }

  return (
    <div className="min-h-screen bg-background-primary">
      <AdminNav
        allowedModules={currentAdmin.modules as AdminModule[]}
        unitId={currentAdmin.unitId ?? null}
        canSeeAllUnits={currentAdmin.canSeeAllUnits}
        units={units}
      />

      <main className="pl-14">
        <div className="w-full max-w-7xl mx-auto px-4 py-6">{children}</div>
      </main>
    </div>
  );
}
