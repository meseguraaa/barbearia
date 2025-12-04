import { prisma } from "@/lib/prisma";
import {
  ProductCard,
  type ClientProduct,
} from "@/components/product-card/product-card";

export const dynamic = "force-dynamic";

export default async function ClientProductsPage() {
  const dbProducts = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });

  const products: ClientProduct[] = dbProducts.map((p) => ({
    id: p.id,
    name: p.name,
    imageUrl: p.imageUrl ?? "", // se TS achar que pode ser null, garantimos string
    description: p.description,
    price: Number(p.price),
    barberPercentage: p.barberPercentage,
    category: p.category,
    stockQuantity: p.stockQuantity,
    isActive: p.isActive,
  }));

  return (
    <div className="max-w-5xl mx-auto">
      <div className="space-y-6 py-4">
        <h1 className="text-title text-content-primary">Produtos</h1>
        <p className="text-paragraph-medium-size text-content-secondary mb-8">
          Veja todos os produtos disponíveis para compra.
        </p>

        {products.length === 0 ? (
          <p className="text-content-secondary mt-4">
            Nenhum produto disponível no momento.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
