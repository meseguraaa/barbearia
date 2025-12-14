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
 * (mantive compatível e adicionei Unit)
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

  // ✅ Unidade do produto (estoque é por unidade)
  unitId?: string | null;
  unitName?: string | null;

  // ✅ prazo em dias
  pickupDeadlineDays?: number | null;
};

type ProductEditDialogProps = {
  product: ProductForRow;
};

export function ProductEditDialog({ product }: ProductEditDialogProps) {
  // truque recomendado pelo Next: partial apply da Server Action
  const updateProductWithId = updateProductAction.bind(null, product.id);

  const pickupDeadlineDaysDefault =
    typeof product.pickupDeadlineDays === "number" &&
    product.pickupDeadlineDays > 0
      ? product.pickupDeadlineDays
      : 2;

  const unitLabel = product.unitName || "—";

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
          {/* ✅ UNIDADE (somente leitura) */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Unidade do estoque
            </label>
            <Input
              value={unitLabel}
              disabled
              className="bg-background-tertiary border-border-primary text-content-primary opacity-90"
            />
            <p className="text-xs text-content-secondary">
              Este produto pertence ao estoque desta unidade. A reserva e o
              checkout seguem essa unidade.
            </p>
          </div>

          {/* NOME */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Nome do produto <span className="text-red-500">*</span>
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
            label="Foto do produto *"
            required
            defaultValue={product.imageUrl ?? ""}
            helperText="Essa imagem será exibida na listagem de produtos."
          />

          {/* DESCRIÇÃO */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Descrição <span className="text-red-500">*</span>
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
              Valor (R$) <span className="text-red-500">*</span>
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
              Porcentagem do barbeiro (%){" "}
              <span className="text-red-500">*</span>
            </label>
            <Input
              name="barberPercentage"
              type="number"
              min={0}
              max={100}
              required
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
              Estoque <span className="text-red-500">*</span>
            </label>
            <Input
              name="stockQuantity"
              type="number"
              min={0}
              required
              defaultValue={product.stockQuantity}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* CATEGORIA / FINALIDADE */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Categoria / Finalidade <span className="text-red-500">*</span>
            </label>
            <Input
              name="category"
              defaultValue={product.category ?? ""}
              required
              placeholder="Ex: Barba, Cabelo, Hidratação..."
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* ✅ PRAZO DE RETIRADA */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Prazo para retirada (dias) <span className="text-red-500">*</span>
            </label>
            <Input
              name="pickupDeadlineDays"
              type="number"
              min={1}
              max={30}
              required
              defaultValue={pickupDeadlineDaysDefault}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
            <p className="text-xs text-content-secondary">
              Após esse prazo, a reserva pode expirar e o produto volta ao
              estoque.
            </p>
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
