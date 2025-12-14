"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";

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

function formatDeadline(days: number) {
  if (!Number.isFinite(days) || days <= 0) return "—";
  if (days === 1) return "1 dia";
  return `${days} dias`;
}

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
  const [reservedUntil, setReservedUntil] = useState<Date | null>(null);

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

  const reservedUntilLabel = useMemo(() => {
    if (!reservedUntil) return null;

    const datePart = format(reservedUntil, "dd/MM", { locale: ptBR });
    const timePart = format(reservedUntil, "HH:mm", { locale: ptBR });
    return `${datePart} às ${timePart}`;
  }, [reservedUntil]);

  // ✅ fallback amigável só para exibir no modal (se ainda não tiver reservado)
  const pickupDays = useMemo(() => {
    const d = Number(product.pickupDeadlineDays);
    return Number.isFinite(d) && d > 0 ? d : 2;
  }, [product.pickupDeadlineDays]);

  const pickupDaysLabel = useMemo(
    () => formatDeadline(pickupDays),
    [pickupDays],
  );

  const estimatedUntilLabel = useMemo(() => {
    // só pra orientar o cliente antes de confirmar
    const estimated = addDays(new Date(), pickupDays);
    return format(estimated, "dd/MM", { locale: ptBR });
  }, [pickupDays]);

  const unitLabel = useMemo(() => {
    const name = (product as any)?.unitName;
    if (typeof name === "string" && name.trim()) return name.trim();
    return "Unidade não informada";
  }, [product]);

  const handleGoToHistory = () => {
    const id = lastOrderId;

    setSuccessOpen(false);

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

        // reservedUntil pode chegar como string, garantimos Date.
        if (result?.reservedUntil) {
          const d =
            result.reservedUntil instanceof Date
              ? result.reservedUntil
              : new Date(result.reservedUntil);
          setReservedUntil(isNaN(d.getTime()) ? null : d);
        } else {
          setReservedUntil(null);
        }

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

            {/* ✅ MENSAGEM NOVA (unidade + prazo) */}
            <div className="rounded-lg border border-border-primary bg-background-tertiary px-3 py-3 space-y-1">
              <p className="text-sm text-content-primary font-medium">
                Este produto está disponível na unidade{" "}
                <span className="underline underline-offset-2">
                  {unitLabel}
                </span>
                .
              </p>

              <p className="text-xs text-content-secondary leading-snug">
                Ao reservar, você garante a separação do item e finaliza o
                pagamento presencialmente nessa unidade.
              </p>

              <p className="text-xs text-content-secondary leading-snug">
                Prazo para retirada:{" "}
                <span className="font-medium text-content-primary">
                  {pickupDaysLabel}
                </span>{" "}
                (estimativa: até{" "}
                <span className="font-medium text-content-primary">
                  {estimatedUntilLabel}
                </span>
                ). Após o prazo, a reserva pode expirar e o produto volta ao
                estoque.
              </p>
            </div>

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
              Produto reservado
            </AlertDialogTitle>

            <AlertDialogDescription className="text-content-secondary">
              Reservamos este produto para você retirar no estabelecimento.
              {/* ✅ também reforça a unidade no sucesso */}
              <div className="mt-3 rounded-lg border border-border-primary bg-background-tertiary px-3 py-2">
                <p className="text-xs text-content-secondary">
                  Unidade de retirada
                </p>
                <p className="text-sm font-semibold text-content-primary">
                  {unitLabel}
                </p>
              </div>
              {reservedUntilLabel ? (
                <div className="mt-3 rounded-lg border border-border-primary bg-background-tertiary px-3 py-2">
                  <p className="text-xs text-content-secondary">
                    Prazo para retirada
                  </p>
                  <p className="text-sm font-semibold text-content-primary">
                    Retire até {reservedUntilLabel}
                  </p>
                  <p className="mt-1 text-xs text-content-secondary">
                    Após esse prazo, a reserva pode expirar e o produto volta ao
                    estoque.
                  </p>
                </div>
              ) : null}
              {lastOrderId ? (
                <span className="block mt-3 text-xs text-content-secondary">
                  Código da reserva:{" "}
                  <span className="font-medium">{lastOrderId}</span>
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="active">Voltar para produtos</Button>
            </AlertDialogCancel>

            <AlertDialogAction asChild>
              <Button variant="edit2" onClick={handleGoToHistory}>
                Ver reserva
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
