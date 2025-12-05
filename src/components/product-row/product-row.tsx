// components/product-row/product-row.tsx
"use client";

import type { ProductForRow } from "@/app/admin/products/page";
import { Button } from "@/components/ui/button";
import { ServiceStatusBadge } from "@/components/service-status-badge";
import { ProductEditDialog } from "@/components/product-edit-dialog";
import { toggleProductStatusAction } from "@/app/admin/products/actions";
import type { ProductForRow as ProductForEditDialog } from "@/components/product-edit-dialog/product-edit-dialog";

type ProductRowProps = {
  product: ProductForRow;
};

export function ProductRow({ product }: ProductRowProps) {
  // Garante que o objeto enviado para o dialog tenha os campos numéricos esperados
  const productForDialog: ProductForEditDialog = {
    ...product,
    priceAsNumber: Number(product.price),
    barberPercentageAsNumber:
      product.barberPercentage !== null ? Number(product.barberPercentage) : 0,
  };

  return (
    <tr className="border-t border-border-primary">
      {/* NOME + FOTO */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-lg border border-border-primary bg-background-secondary">
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imageUrl}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[10px] text-content-secondary">
                Sem foto
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <span className="font-medium text-content-primary">
              {product.name}
            </span>
            <span className="text-[11px] text-content-secondary line-clamp-1">
              {product.description}
            </span>
          </div>
        </div>
      </td>

      {/* PREÇO */}
      <td className="px-4 py-3">R$ {Number(product.price).toFixed(2)}</td>

      {/* COMISSÃO DO BARBEIRO */}
      <td className="px-4 py-3">
        {product.barberPercentage !== null
          ? `${product.barberPercentage}%`
          : "-"}
      </td>

      {/* CATEGORIA / FINALIDADE */}
      <td className="px-4 py-3">{product.category || "—"}</td>

      {/* ESTOQUE */}
      <td className="px-4 py-3">
        {product.stockQuantity} unidade
        {product.stockQuantity === 1 ? "" : "s"}
      </td>

      {/* STATUS */}
      <td className="px-4 py-3">
        <ServiceStatusBadge isActive={product.isActive} />
      </td>

      {/* AÇÕES */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <ProductEditDialog product={productForDialog} />

          <form action={toggleProductStatusAction.bind(null, product.id)}>
            <Button
              variant={product.isActive ? "destructive" : "active"}
              size="sm"
              type="submit"
              className="border-border-primary hover:bg-muted/40"
            >
              {product.isActive ? "Desativar" : "Ativar"}
            </Button>
          </form>
        </div>
      </td>
    </tr>
  );
}
