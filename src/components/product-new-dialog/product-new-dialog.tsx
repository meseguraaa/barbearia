"use client";

import { useMemo, useState, useTransition } from "react";

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
import { createProductAction } from "@/app/admin/products/actions";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type UnitOption = {
  id: string;
  name: string;
  isActive: boolean;
};

export function ProductNewDialog({
  units = [],
  defaultUnitId,
  canSeeAllUnits = true,
}: {
  units?: UnitOption[];
  defaultUnitId?: string | null;
  canSeeAllUnits?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const initialUnitId = useMemo(() => {
    if (!canSeeAllUnits && defaultUnitId) return defaultUnitId;
    if (defaultUnitId) return defaultUnitId;
    const firstActive = units.find((u) => u.isActive);
    return firstActive?.id ?? "";
  }, [units, defaultUnitId, canSeeAllUnits]);

  const [selectedUnitId, setSelectedUnitId] = useState<string>(initialUnitId);

  function handleCreate(formData: FormData) {
    // ✅ garante que unitId vai junto (estoque por unidade)
    formData.set("unitId", selectedUnitId);

    startTransition(async () => {
      await createProductAction(formData);
      setOpen(false);
    });
  }

  const hasUnits = units.length > 0;
  const unitIsLocked = !canSeeAllUnits && !!defaultUnitId;

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="brand">Novo produto</Button>
      </DialogTrigger>

      <DialogContent className="bg-background-secondary border border-border-primary max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Novo produto
          </DialogTitle>
        </DialogHeader>

        <form action={handleCreate} className="space-y-4 pb-2">
          {/* ✅ UNIDADE */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Unidade do estoque <span className="text-red-500">*</span>
            </label>

            {unitIsLocked ? (
              <>
                <Input
                  value={units.find((u) => u.id === defaultUnitId)?.name ?? "—"}
                  disabled
                  className="bg-background-tertiary border-border-primary text-content-primary opacity-90"
                />
                <input
                  type="hidden"
                  name="unitId"
                  value={defaultUnitId ?? ""}
                />
                <p className="text-xs text-content-secondary">
                  Você é admin de unidade. Produtos criados aqui ficam nesta
                  unidade.
                </p>
              </>
            ) : (
              <>
                <Select
                  value={selectedUnitId}
                  onValueChange={(v) => setSelectedUnitId(v)}
                  disabled={!hasUnits}
                >
                  <SelectTrigger className="bg-background-tertiary border-border-primary text-content-primary">
                    <SelectValue
                      placeholder={
                        hasUnits
                          ? "Selecione a unidade"
                          : "Nenhuma unidade cadastrada"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem
                        key={u.id}
                        value={u.id}
                        disabled={!u.isActive}
                      >
                        {u.name} {!u.isActive ? "(inativa)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* redundância pro server action (e também ajuda no autofill) */}
                <input type="hidden" name="unitId" value={selectedUnitId} />

                <p className="text-xs text-content-secondary">
                  O estoque não é central. Reservas e checkout seguirão a
                  unidade escolhida.
                </p>
              </>
            )}
          </div>

          {/* NOME */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Nome do produto <span className="text-red-500">*</span>
            </label>
            <Input
              name="name"
              required
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* FOTO (UPLOAD) */}
          <UploadImageField
            name="imageUrl"
            label="Foto do produto *"
            required
            defaultValue=""
            helperText="Essa imagem será exibida na listagem de produtos."
          />

          {/* DESCRIÇÃO */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Descrição <span className="text-red-500">*</span>
            </label>
            <Textarea
              name="description"
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
              placeholder="Ex: 79.90"
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
              placeholder="Ex: 10"
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
              defaultValue={2}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
            <p className="text-xs text-content-secondary">
              Após esse prazo, a reserva pode expirar e o produto volta ao
              estoque.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="submit"
              variant="brand"
              disabled={
                isPending ||
                (!unitIsLocked &&
                  (!selectedUnitId || selectedUnitId.length === 0))
              }
              title={
                !unitIsLocked &&
                (!selectedUnitId || selectedUnitId.length === 0)
                  ? "Selecione uma unidade"
                  : undefined
              }
            >
              {isPending ? "Salvando..." : "Criar produto"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
