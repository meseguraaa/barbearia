// app/admin/products/page.tsx
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import { cookies } from "next/headers";

import { ProductRow } from "@/components/product-row";
import { ProductNewDialog } from "@/components/product-new-dialog";
import { requireAdminPermission } from "@/lib/admin-permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Produtos",
};

const UNIT_COOKIE_NAME = "admin_unit_context";
const UNIT_ALL_VALUE = "all";

// 👇 tipo "plano" que vai para o Client Component
export type ProductForRow = {
  id: string;
  name: string;
  imageUrl: string | null;
  description: string;
  price: number;
  barberPercentage: number | null;
  category: string | null;
  stockQuantity: number;
  isActive: boolean;

  pickupDeadlineDays: number;

  unitId: string;
  unitName: string;

  birthdayBenefitEnabled: boolean;
  hasLevelPrices: boolean;

  // (não mostramos na tabela; fica apenas nos modais New/Edit)
  isFeatured: boolean;
};

/**
 * Resolve o "escopo" de unidade para as queries do admin.
 * - Dono: respeita cookie (all = tudo)
 * - Admin de unidade: ignora cookie e força unitId do admin
 */
async function resolveUnitScope(admin: {
  unitId: string | null;
  canSeeAllUnits: boolean;
}) {
  if (!admin.canSeeAllUnits) return admin.unitId;

  const cookieStore = await cookies();
  const cookieValue =
    cookieStore.get(UNIT_COOKIE_NAME)?.value ?? UNIT_ALL_VALUE;

  if (!cookieValue || cookieValue === UNIT_ALL_VALUE) return null;
  return cookieValue;
}

export default async function ProductsPage() {
  const admin = (await requireAdminPermission("canAccessProducts")) as any;

  const activeUnitId = await resolveUnitScope({
    unitId: admin?.unitId ?? null,
    canSeeAllUnits: !!admin?.canSeeAllUnits,
  });

  const units = await prisma.unit.findMany({
    where: activeUnitId ? { id: activeUnitId } : {},
    orderBy: { name: "asc" },
    select: { id: true, name: true, isActive: true },
  });

  const productsPrisma = await prisma.product.findMany({
    where: activeUnitId ? { unitId: activeUnitId } : {},
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      unit: { select: { id: true, name: true } },
      _count: { select: { prices: true } },
    },
  });

  const products: ProductForRow[] = productsPrisma.map((p) => ({
    id: p.id,
    name: p.name,
    imageUrl: p.imageUrl,
    description: p.description,
    price: Number(p.price),
    barberPercentage:
      p.barberPercentage !== null && p.barberPercentage !== undefined
        ? Number(p.barberPercentage)
        : null,
    category: p.category,
    stockQuantity: p.stockQuantity,
    isActive: p.isActive,

    pickupDeadlineDays:
      typeof (p as any).pickupDeadlineDays === "number" &&
      Number.isFinite((p as any).pickupDeadlineDays) &&
      (p as any).pickupDeadlineDays > 0
        ? (p as any).pickupDeadlineDays
        : 2,

    unitId: p.unit?.id ?? p.unitId,
    unitName: p.unit?.name ?? "—",

    birthdayBenefitEnabled: Boolean((p as any).birthdayBenefitEnabled),
    hasLevelPrices: ((p as any)?._count?.prices ?? 0) > 0,

    isFeatured: Boolean((p as any).isFeatured),
  }));

  return (
    <div className="max-w-7xl space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title text-content-primary">Produtos</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Gerencie os produtos disponíveis para venda.
          </p>
        </div>

        <ProductNewDialog
          units={units}
          defaultUnitId={activeUnitId}
          canSeeAllUnits={!!admin?.canSeeAllUnits}
        />
      </header>

      <section className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
        <table className="w-full table-fixed border-collapse text-sm">
          {/* ✅ grade fixa (colunas fixas, não dança) */}
          <colgroup>
            <col className="w-[380px]" />
            <col className="w-[220px]" />
            <col className="w-[110px]" />
            <col className="w-[110px]" />
            <col className="w-[110px]" />
            <col className="w-[110px]" />
            <col className="w-[110px]" />
            <col className="w-[110px]" />
            <col className="w-60" />
          </colgroup>

          <thead>
            <tr className="border-b border-border-primary bg-background-secondary">
              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                Produto
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                Unidade
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                Preço
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                Comissão
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                Categoria
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                Estoque
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                Prazo
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary">
                Ações
              </th>
            </tr>
          </thead>

          <tbody className="[&>tr>td]:align-middle">
            {products.length === 0 ? (
              <tr className="border-t border-border-primary">
                <td
                  colSpan={9}
                  className="px-4 py-6 text-center text-paragraph-small text-content-secondary"
                >
                  Nenhum produto cadastrado ainda.
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <ProductRow key={product.id} product={product} />
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
