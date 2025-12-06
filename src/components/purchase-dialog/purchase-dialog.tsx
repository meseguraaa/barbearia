"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { createProductSale } from "@/app/client/products/actions";
import type { ClientProduct } from "@/components/product-card";

type ProductPurchaseDialogProps = {
  product: ClientProduct;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  // 🔹 clientId opcional (cliente logado)
  clientId?: string | null;
};

export function ProductPurchaseDialog({
  product,
  open,
  onOpenChange,
  clientId,
}: ProductPurchaseDialogProps) {
  const [quantity, setQuantity] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    setQuantity(1);
    setError("");
  }, [open]);

  const increment = () => {
    if (quantity < product.stockQuantity) setQuantity(quantity + 1);
  };

  const decrement = () => {
    if (quantity > 1) setQuantity(quantity - 1);
  };

  const total = product.price * quantity;

  const handlePurchase = () => {
    setError("");

    startTransition(async () => {
      try {
        const result = await createProductSale({
          productId: product.id,
          quantity,
          // 🔹 vincula o pedido ao cliente quando existir
          clientId: clientId ?? undefined,
        });

        if (!result?.ok) {
          setError("Não foi possível registrar o pedido.");
          return;
        }

        onOpenChange(false);
      } catch (err: any) {
        setError(
          err.message || "Erro inesperado ao registrar o pedido de produto.",
        );
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background-secondary border-border-primary">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Reservar {product.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* IMAGEM */}
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-40 object-cover rounded-lg border border-border-primary"
          />

          <p className="text-content-secondary text-sm">
            Esse pedido será registrado no seu histórico e finalizado na
            barbearia, no momento da compra.
          </p>

          {/* DESCRIÇÃO */}
          <p className="text-content-secondary text-sm">
            {product.description}
          </p>

          {/* QUANTIDADE */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Quantidade
            </label>

            <div className="flex items-center gap-3">
              <Button onClick={decrement} variant="outline" size="sm">
                -
              </Button>

              <Input value={quantity} readOnly className="w-16 text-center" />

              <Button onClick={increment} variant="outline" size="sm">
                +
              </Button>
            </div>
          </div>

          {/* TOTAL */}
          <div className="text-right font-medium text-content-primary">
            Total estimado: R$ {total.toFixed(2)}
          </div>

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <Button
            className="w-full"
            disabled={isPending}
            variant="brand"
            onClick={handlePurchase}
          >
            {isPending ? "Registrando pedido..." : "Confirmar pedido"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
