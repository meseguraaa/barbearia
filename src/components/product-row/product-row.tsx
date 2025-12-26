// components/product-row/product-row.tsx
"use client";

import type { ProductForRow } from "@/app/admin/products/page";
import { Button } from "@/components/ui/button";
import { ServiceStatusBadge } from "@/components/service-status-badge";
import { ProductEditDialog } from "@/components/product-edit-dialog";
import { toggleProductStatusAction } from "@/app/admin/products/actions";

type ProductRowProps = {
  product: ProductForRow;
};

const MAX_TEXT_LENGTH = 50;

function truncate(
  text: string | null | undefined,
  max: number = MAX_TEXT_LENGTH,
): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

function formatDeadline(days: number) {
  if (!Number.isFinite(days) || days <= 0) return "—";
  if (days === 1) return "1 dia";
  return `${days} dias`;
}

function Badge({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center rounded-full border border-border-primary bg-background-secondary px-2 py-0.5 text-[11px] text-content-secondary"
    >
      {children}
    </span>
  );
}

export function ProductRow({ product }: ProductRowProps) {
  const displayName = truncate(product.name);

  const deadlineText = formatDeadline(product.pickupDeadlineDays);

  const birthdayBenefitEnabled = Boolean(product.birthdayBenefitEnabled);
  const hasLevelPrices = Boolean(product.hasLevelPrices);
  const isFeatured = Boolean(product.isFeatured);

  const hasAnyBadge = isFeatured || birthdayBenefitEnabled || hasLevelPrices;

  return (
    <tr className="border-t border-border-primary">
      {/* NOME + FOTO */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-4">
          {/* Imagem */}
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border-primary bg-background-secondary">
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

          {/* Nome + badges */}
          <div className="flex min-w-0 flex-col gap-2">
            <span className="font-medium text-content-primary leading-tight">
              {displayName}
            </span>

            {hasAnyBadge && (
              <div className="flex flex-wrap items-center gap-2">
                {isFeatured && (
                  <Badge title="Este produto aparece no carrossel de Destaques do app.">
                    ⭐ Destaque
                  </Badge>
                )}

                {hasLevelPrices && (
                  <Badge title="Este produto tem descontos por nível.">
                    💎 Níveis
                  </Badge>
                )}

                {birthdayBenefitEnabled && (
                  <Badge title="Este produto tem benefício de aniversário.">
                    🎂 Aniversário
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
      </td>

      {/* UNIDADE */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          <span className="text-content-primary">
            {product.unitName || "—"}
          </span>
          <span className="text-[11px] text-content-secondary">
            Estoque da unidade
          </span>
        </div>
      </td>

      {/* PREÇO */}
      <td className="px-4 py-3 whitespace-nowrap">
        R$ {Number(product.price).toFixed(2)}
      </td>

      {/* COMISSÃO */}
      <td className="px-4 py-3 whitespace-nowrap">
        {product.barberPercentage !== null &&
        product.barberPercentage !== undefined
          ? `${Number(product.barberPercentage)}%`
          : "-"}
      </td>

      {/* CATEGORIA */}
      <td className="px-4 py-3">{product.category || "—"}</td>

      {/* ESTOQUE */}
      <td className="px-4 py-3 whitespace-nowrap">
        {product.stockQuantity} un.
      </td>

      {/* PRAZO */}
      <td className="px-4 py-3">
        <span className="text-content-primary">{deadlineText}</span>
        <span className="block text-[11px] text-content-secondary">
          Retirada
        </span>
      </td>

      {/* STATUS */}
      <td className="px-4 py-3">
        <ServiceStatusBadge isActive={product.isActive} />
      </td>

      {/* AÇÕES */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-3">
          {/* ✅ agora sem gambiarra */}
          <ProductEditDialog product={product} />

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
