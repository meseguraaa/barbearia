"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ProductPurchaseDialog } from "../purchase-dialog";

// 👉 TIPO OFICIAL
export type ClientProduct = {
  id: string;
  name: string;
  imageUrl: string; // string mesmo
  description: string;
  price: number;
  barberPercentage: number;
  category: string;
  stockQuantity: number;
  isActive: boolean;
};

type ProductCardProps = {
  product: ClientProduct;
};

export function ProductCard({ product }: ProductCardProps) {
  const [open, setOpen] = useState(false);

  const isOutOfStock = product.stockQuantity <= 0;

  return (
    <>
      <div className="rounded-xl border border-border-primary bg-background-secondary shadow-sm overflow-hidden">
        {/* IMAGEM */}
        <div className="h-40 w-full overflow-hidden border-b border-border-primary">
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        </div>

        {/* INFO */}
        <div className="p-4 space-y-2">
          <h3 className="font-semibold text-content-primary">{product.name}</h3>

          <p className="text-sm text-content-secondary line-clamp-2">
            {product.description}
          </p>

          <div className="flex items-center justify-between mt-2">
            <span className="font-semibold text-content-primary">
              R$ {product.price.toFixed(2)}
            </span>

            {isOutOfStock ? (
              <span className="text-xs text-red-500 font-medium">Esgotado</span>
            ) : (
              <span className="text-xs text-content-secondary">
                Em estoque: {product.stockQuantity}
              </span>
            )}
          </div>

          <Button
            className="w-full mt-3"
            disabled={isOutOfStock}
            onClick={() => setOpen(true)}
            variant="brand"
          >
            Comprar
          </Button>
        </div>
      </div>

      {/* MODAL */}
      <ProductPurchaseDialog
        product={product}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
