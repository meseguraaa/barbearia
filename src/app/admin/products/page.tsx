// app/admin/products/page.tsx
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import { cookies } from "next/headers";

import { ProductRow } from "@/components/product-row";
import { ProductNewDialog } from "@/components/product-new-dialog";
import { requireAdminPermission } from "@/lib/admin-permissions";
import type { CustomerLevel } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Produtos",
};

const UNIT_COOKIE_NAME = "admin_unit_context";
const UNIT_ALL_VALUE = "all";

// 👇 tipo que vai para o Client Component
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
  birthdayPriceLevel?: CustomerLevel | null;

  // agora significa "tem descontos por nível"
  hasLevelPrices: boolean;

  // ✅ valores pra preencher o modal
  levelDiscounts?: Partial<Record<CustomerLevel, number>>;

  // ✅ destaque
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

/**
 * Garante que um unitId (vindo do cookie) pertence à company atual.
 * Se não pertencer, ignora e cai no "all".
 */
async function sanitizeUnitScope(params: {
  companyId: string;
  activeUnitId: string | null;
}) {
  const { companyId, activeUnitId } = params;

  if (!activeUnitId) return null;

  const belongs = await prisma.unit.findFirst({
    where: { id: activeUnitId, companyId },
    select: { id: true },
  });

  return belongs ? activeUnitId : null;
}

export default async function ProductsPage() {
  const admin = (await requireAdminPermission("canAccessProducts")) as any;

  const companyId = String(admin?.companyId ?? "").trim();
  if (!companyId) {
    throw new Error("Contexto inválido: companyId ausente (multi-tenant).");
  }

  const rawActiveUnitId = await resolveUnitScope({
    unitId: admin?.unitId ?? null,
    canSeeAllUnits: !!admin?.canSeeAllUnits,
  });

  const activeUnitId = await sanitizeUnitScope({
    companyId,
    activeUnitId: rawActiveUnitId,
  });

  const units = await prisma.unit.findMany({
    where: {
      companyId,
      ...(activeUnitId ? { id: activeUnitId } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, isActive: true },
  });

  // ✅ Traz explicitamente tudo que o modal precisa (sem depender de action extra)
  const productsPrisma = await prisma.product.findMany({
    where: {
      ...(activeUnitId ? { unitId: activeUnitId } : {}),
      // 🔒 multi-tenant: produto precisa pertencer à company via unidade
      unit: { companyId },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      name: true,
      imageUrl: true,
      description: true,
      price: true,
      barberPercentage: true,
      category: true,
      stockQuantity: true,
      isActive: true,
      pickupDeadlineDays: true,
      unitId: true,

      unit: { select: { id: true, name: true } },

      birthdayBenefitEnabled: true,
      birthdayPriceLevel: true,
      isFeatured: true,

      discounts: { select: { level: true, discountPct: true } },
    },
  });

  const products: ProductForRow[] = productsPrisma.map((p) => {
    const pickupDeadlineDays =
      typeof p.pickupDeadlineDays === "number" &&
      Number.isFinite(p.pickupDeadlineDays) &&
      p.pickupDeadlineDays > 0
        ? p.pickupDeadlineDays
        : 2;

    const levelDiscounts: Partial<Record<CustomerLevel, number>> = {};

    for (const row of p.discounts ?? []) {
      const pct = Number(row.discountPct);
      if (Number.isFinite(pct)) levelDiscounts[row.level] = pct;
    }

    return {
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

      pickupDeadlineDays,

      unitId: p.unit?.id ?? p.unitId,
      unitName: p.unit?.name ?? "—",

      birthdayBenefitEnabled: Boolean(p.birthdayBenefitEnabled),
      birthdayPriceLevel: (p.birthdayPriceLevel ??
        null) as CustomerLevel | null,

      hasLevelPrices: (p.discounts?.length ?? 0) > 0,

      levelDiscounts,

      isFeatured: Boolean(p.isFeatured),
    };
  });

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
          <colgroup>
            <col className="w-95" />
            <col className="w-55" />
            <col className="w-27.5" />
            <col className="w-27.5" />
            <col className="w-27.5" />
            <col className="w-27.5" />
            <col className="w-27.5" />
            <col className="w-27.5" />
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
