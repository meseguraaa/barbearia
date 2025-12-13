"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

import { createProductSale } from "@/app/client/products/actions";
import type { ClientProduct } from "@/components/product-card";

type ProductPurchaseDialogProps = {
  product: ClientProduct;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId?: string | null;
};

export function ProductPurchaseDialog({
  product,
  open,
  onOpenChange,
  clientId,
}: ProductPurchaseDialogProps) {
  const router = useRouter();

  const [quantity, setQuantity] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [successOpen, setSuccessOpen] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setQuantity(1);
    setError("");
  }, [open]);

  const isOutOfStock = product.stockQuantity <= 0;

  const total = useMemo(
    () => product.price * quantity,
    [product.price, quantity],
  );

  const increment = () => {
    if (isPending) return;
    if (quantity < product.stockQuantity) setQuantity((q) => q + 1);
  };

  const decrement = () => {
    if (isPending) return;
    if (quantity > 1) setQuantity((q) => q - 1);
  };

  const handleGoToHistory = () => {
    const id = lastOrderId;

    setSuccessOpen(false);

    // 🔹 manda o orderId pra destacar no histórico
    if (id) {
      router.push(`/client/history?orderId=${encodeURIComponent(id)}`);
    } else {
      router.push("/client/history");
    }

    router.refresh();
  };

  const handlePurchase = () => {
    setError("");

    startTransition(async () => {
      try {
        const result = await createProductSale({
          productId: product.id,
          quantity,
          clientId: clientId ?? undefined,
        });

        if (!result?.ok || !result?.orderId) {
          setError("Não foi possível registrar o pedido.");
          return;
        }

        setLastOrderId(result.orderId);

        // fecha o dialog de compra e abre o alerta de sucesso
        onOpenChange(false);
        setSuccessOpen(true);
      } catch (err: any) {
        const msg =
          err?.message || "Erro inesperado ao registrar o pedido de produto.";
        setError(msg);
        toast.error("Não foi possível reservar o produto.", {
          description: msg,
        });
      }
    });
  };

  return (
    <>
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
                <Button
                  onClick={decrement}
                  variant="outline"
                  size="sm"
                  disabled={isPending || quantity <= 1}
                >
                  -
                </Button>

                <Input value={quantity} readOnly className="w-16 text-center" />

                <Button
                  onClick={increment}
                  variant="outline"
                  size="sm"
                  disabled={isPending || quantity >= product.stockQuantity}
                >
                  +
                </Button>

                {isOutOfStock ? (
                  <span className="ml-auto text-xs text-red-500 font-medium">
                    Esgotado
                  </span>
                ) : (
                  <span className="ml-auto text-xs text-content-secondary">
                    Em estoque: {product.stockQuantity}
                  </span>
                )}
              </div>
            </div>

            {/* TOTAL */}
            <div className="text-right font-medium text-content-primary">
              Total estimado: R$ {total.toFixed(2)}
            </div>

            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}

            <Button
              className="w-full"
              disabled={isPending || isOutOfStock}
              variant="brand"
              onClick={handlePurchase}
            >
              {isPending ? "Registrando pedido..." : "Confirmar pedido"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ALERTA DE SUCESSO (padrão) */}
      <AlertDialog open={successOpen} onOpenChange={setSuccessOpen}>
        <AlertDialogContent className="bg-background-secondary border border-border-primary">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-title text-content-primary">
              Produto reservado ✅
            </AlertDialogTitle>
            <AlertDialogDescription className="text-content-secondary">
              Reservamos este produto para você retirar no estabelecimento.
              {lastOrderId ? (
                <span className="block mt-2 text-xs text-content-secondary">
                  Código da reserva:{" "}
                  <span className="font-medium">{lastOrderId}</span>
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel className="border-border-primary">
              Voltar para produtos
            </AlertDialogCancel>

            <AlertDialogAction
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={handleGoToHistory}
            >
              Ver reserva
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
