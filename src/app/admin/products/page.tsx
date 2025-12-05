// app/admin/products/page.tsx
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

import { ProductRow } from "@/components/product-row";
import { ProductNewDialog } from "@/components/product-new-dialog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Produtos",
};

type ProductFromPrisma = Awaited<
  ReturnType<typeof prisma.product.findMany>
>[number];

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
};

export default async function ProductsPage() {
  const productsPrisma: ProductFromPrisma[] = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
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

        <ProductNewDialog />
      </header>

      {/* TABELA */}
      <section className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
        <table className="min-w-full text-sm">
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
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
