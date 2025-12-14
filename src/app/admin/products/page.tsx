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

  // ✅ novo: prazo para retirada (dias)
  pickupDeadlineDays: number;

  // ✅ novo: unidade do produto (estoque por unidade)
  unitId: string;
  unitName: string;
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
  // 🔐 Permissão: precisa ter acesso a Produtos (ou ser Dono)
  const admin = (await requireAdminPermission("canAccessProducts")) as any;

  // ✅ Unidade ativa para TODAS as queries desta página
  const activeUnitId = await resolveUnitScope({
    unitId: admin?.unitId ?? null,
    canSeeAllUnits: !!admin?.canSeeAllUnits,
  });

  // ✅ lista de unidades para o modal (dono vê todas, admin de unidade vê só a dele)
  const units = await prisma.unit.findMany({
    where: activeUnitId ? { id: activeUnitId } : {},
    orderBy: { name: "asc" },
    select: { id: true, name: true, isActive: true },
  });

  const productsPrisma = await prisma.product.findMany({
    where: activeUnitId ? { unitId: activeUnitId } : {},
    orderBy: { createdAt: "desc" },
    include: {
      unit: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // 🔧 aqui a gente tira Decimal e deixa tudo como number/string
  const products: ProductForRow[] = productsPrisma.map((p) => ({
    id: p.id,
    name: p.name,
    imageUrl: p.imageUrl,
    description: p.description,
    price: Number(p.price), // Decimal -> number
    barberPercentage:
      p.barberPercentage !== null && p.barberPercentage !== undefined
        ? Number(p.barberPercentage)
        : null,
    category: p.category,
    stockQuantity: p.stockQuantity,
    isActive: p.isActive,

    pickupDeadlineDays:
      typeof (p as any).pickupDeadlineDays === "number" &&
      (p as any).pickupDeadlineDays > 0
        ? (p as any).pickupDeadlineDays
        : 2,

    unitId: p.unit?.id ?? p.unitId,
    unitName: p.unit?.name ?? "—",
  }));

  return (
    <div className="space-y-6 max-w-7xl">
      {/* HEADER */}
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title text-content-primary">Produtos</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Gerencie os produtos disponíveis para venda.
          </p>
        </div>

        {/* ✅ Agora o modal já sabe a unidade do estoque */}
        <ProductNewDialog
          units={units}
          defaultUnitId={activeUnitId}
          canSeeAllUnits={!!admin?.canSeeAllUnits}
        />
      </header>

      {/* TABELA */}
      <section className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border-primary bg-background-secondary">
              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                Produto
              </th>

              {/* ✅ nova coluna */}
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

          <tbody>
            {products.length === 0 ? (
              <tr>
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
