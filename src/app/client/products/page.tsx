// app/client/products/page.tsx
import { prisma } from "@/lib/prisma";
import {
  ProductCard,
  type ClientProduct,
} from "@/components/product-card/product-card";
import { getServerSession } from "next-auth";
import { nextAuthOptions } from "@/lib/nextauth";
import { redirect } from "next/navigation";
import { ClientUnitFilter } from "@/components/client-unit-filter";

export const dynamic = "force-dynamic";

type ClientProductsPageProps = {
  searchParams?: Promise<{
    unit?: string; // "all" | unitId
  }>;
};

const UNIT_ALL_VALUE = "all";

export default async function ClientProductsPage({
  searchParams,
}: ClientProductsPageProps) {
  // 🔹 pega sessão atual (se houver)
  const session = await getServerSession(nextAuthOptions);
  const clientId = ((session?.user as any)?.id as string | undefined) ?? null;

  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedUnitParam = resolvedSearchParams.unit ?? UNIT_ALL_VALUE;

  // ✅ lista de unidades (para o filtro)
  const units = await prisma.unit.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // ✅ valida query param (se vier um unitId inexistente, volta pra all)
  const isValidUnit =
    selectedUnitParam === UNIT_ALL_VALUE ||
    units.some((u) => u.id === selectedUnitParam);

  if (!isValidUnit) {
    redirect("/client/products?unit=all");
  }

  const activeUnitId =
    selectedUnitParam === UNIT_ALL_VALUE ? null : selectedUnitParam;

  const dbProducts = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(activeUnitId ? { unitId: activeUnitId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      unit: {
        select: { id: true, name: true },
      },
    },
  });

  const products: ClientProduct[] = dbProducts.map((p) => ({
    id: p.id,
    name: p.name,
    imageUrl: p.imageUrl ?? "",
    description: p.description,
    price: Number(p.price),
    barberPercentage: p.barberPercentage,
    category: p.category,
    stockQuantity: p.stockQuantity,
    isActive: p.isActive,

    // ✅ novos (para o modal de reserva mostrar certinho)
    unitId: p.unitId,
    unitName: p.unit?.name ?? "—",
    pickupDeadlineDays:
      typeof (p as any).pickupDeadlineDays === "number" &&
      (p as any).pickupDeadlineDays > 0
        ? (p as any).pickupDeadlineDays
        : 2,
  })) as any;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="space-y-6 py-4">
        {/* Header + filtro */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-title text-content-primary">Produtos</h1>
            <p className="text-content-secondary">
              Veja todos os produtos disponíveis para você deixar reservado e
              finalizar a compra no estabelecimento.
            </p>
          </div>

          <ClientUnitFilter units={units} defaultValue={selectedUnitParam} />
        </div>

        {products.length === 0 ? (
          <p className="text-content-secondary mt-4">
            Nenhum produto disponível no momento.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                clientId={clientId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
