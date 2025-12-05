"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UploadImageField } from "@/components/upload-image-field/upload-image-field";
import { updateProductAction } from "@/app/admin/products/actions";

/**
 * Mesmo tipo que você está usando no ProductRow
 * (ajuste aqui se o seu ProductForRow for diferente)
 */
export type ProductForRow = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceAsNumber: number;
  barberPercentageAsNumber: number | null;
  stockQuantity: number;
  category: string | null;
  isActive: boolean;
};

type ProductEditDialogProps = {
  product: ProductForRow;
};

export function ProductEditDialog({ product }: ProductEditDialogProps) {
  // truque recomendado pelo Next: partial apply da Server Action
  const updateProductWithId = updateProductAction.bind(null, product.id);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="edit2"
          size="sm"
          className="border-border-primary hover:bg-muted/40"
        >
          Editar
        </Button>
      </DialogTrigger>

      <DialogContent className="bg-background-secondary border border-border-primary max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Editar produto
          </DialogTitle>
        </DialogHeader>

        <form action={updateProductWithId} className="space-y-4 pb-2">
          {/* NOME */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Nome do produto
            </label>
            <Input
              name="name"
              defaultValue={product.name}
              required
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* FOTO (UPLOAD) */}
          <UploadImageField
            name="imageUrl"
            label="Foto do produto"
            required
            defaultValue={product.imageUrl ?? ""}
            helperText="Essa imagem será exibida na listagem de produtos."
          />

          {/* DESCRIÇÃO */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Descrição
            </label>
            <Textarea
              name="description"
              defaultValue={product.description ?? ""}
              required
              rows={3}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* VALOR */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Valor (R$)
            </label>
            <Input
              name="price"
              type="text"
              required
              defaultValue={String(product.priceAsNumber)}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* PORCENTAGEM DO BARBEIRO */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Porcentagem do barbeiro (%)
            </label>
            <Input
              name="barberPercentage"
              type="number"
              min={0}
              max={100}
              defaultValue={
                product.barberPercentageAsNumber !== null &&
                product.barberPercentageAsNumber !== undefined
                  ? String(product.barberPercentageAsNumber)
                  : ""
              }
              placeholder="Ex: 20"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* ESTOQUE */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Estoque
            </label>
            <Input
              name="stockQuantity"
              type="number"
              min={0}
              defaultValue={product.stockQuantity}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* CATEGORIA / FINALIDADE */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Categoria / Finalidade
            </label>
            <Input
              name="category"
              defaultValue={product.category ?? ""}
              required
              placeholder="Ex: Barba, Cabelo, Hidratação..."
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" variant="brand">
              Salvar alterações
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
