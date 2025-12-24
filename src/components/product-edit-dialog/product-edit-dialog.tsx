"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

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

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  unitId?: string | null;
  unitName?: string | null;

  pickupDeadlineDays?: number | null;

  birthdayBenefitEnabled?: boolean;
  birthdayPriceLevel?: "BRONZE" | "PRATA" | "OURO" | "DIAMANTE" | null;

  levelPrices?: Partial<
    Record<"BRONZE" | "PRATA" | "OURO" | "DIAMANTE", number>
  >;
};

type ProductEditDialogProps = {
  product: ProductForRow;
};

type CustomerLevel = "BRONZE" | "PRATA" | "OURO" | "DIAMANTE";

const LEVEL_OPTIONS: Array<{ value: CustomerLevel; label: string }> = [
  { value: "BRONZE", label: "Bronze" },
  { value: "PRATA", label: "Prata" },
  { value: "OURO", label: "Ouro" },
  { value: "DIAMANTE", label: "Diamante" },
];

function PriceLevelGrid({
  basePrice,
  values,
  onChange,
}: {
  basePrice: string;
  values: Record<CustomerLevel, string>;
  onChange: (level: CustomerLevel, value: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border-primary bg-background-tertiary p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-content-primary">
            Preços por nível
          </p>
          <p className="text-xs text-content-secondary">
            Se você deixar vazio, o sistema usa o preço normal (Bronze) e aplica
            fallback.
          </p>
        </div>

        <div className="text-xs text-content-secondary">
          Base:{" "}
          <span className="text-content-primary">R$ {basePrice || "—"}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <label className="text-xs text-content-secondary">Bronze</label>
          <Input
            name="priceBronze"
            inputMode="decimal"
            placeholder={basePrice ? `Ex: ${basePrice}` : "Ex: 79.90"}
            value={values.BRONZE}
            onChange={(e) => onChange("BRONZE", e.target.value)}
            className="bg-background-secondary border-border-primary text-content-primary"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-content-secondary">Prata</label>
          <Input
            name="pricePrata"
            inputMode="decimal"
            placeholder="Ex: 74.90"
            value={values.PRATA}
            onChange={(e) => onChange("PRATA", e.target.value)}
            className="bg-background-secondary border-border-primary text-content-primary"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-content-secondary">Ouro</label>
          <Input
            name="priceOuro"
            inputMode="decimal"
            placeholder="Ex: 69.90"
            value={values.OURO}
            onChange={(e) => onChange("OURO", e.target.value)}
            className="bg-background-secondary border-border-primary text-content-primary"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-content-secondary">Diamante</label>
          <Input
            name="priceDiamante"
            inputMode="decimal"
            placeholder="Ex: 64.90"
            value={values.DIAMANTE}
            onChange={(e) => onChange("DIAMANTE", e.target.value)}
            className="bg-background-secondary border-border-primary text-content-primary"
          />
        </div>
      </div>

      <p className="text-[11px] text-content-secondary">
        Você pode preencher só alguns níveis. Os demais herdam por fallback
        (Diamante → Ouro → Prata → Bronze).
      </p>
    </div>
  );
}

export function ProductEditDialog({ product }: ProductEditDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const updateProductWithId = updateProductAction.bind(null, product.id);

  const pickupDeadlineDaysDefault =
    typeof product.pickupDeadlineDays === "number" &&
    product.pickupDeadlineDays > 0
      ? product.pickupDeadlineDays
      : 2;

  const unitLabel = product.unitName || "—";

  const initialBasePrice = useMemo(
    () => String(product.priceAsNumber ?? ""),
    [product.priceAsNumber],
  );

  const [basePrice, setBasePrice] = useState<string>(initialBasePrice);

  const [levelPrices, setLevelPrices] = useState<Record<CustomerLevel, string>>(
    {
      BRONZE: "",
      PRATA: "",
      OURO: "",
      DIAMANTE: "",
    },
  );

  const [birthdayEnabled, setBirthdayEnabled] = useState<boolean>(
    Boolean(product.birthdayBenefitEnabled),
  );
  const [birthdayLevel, setBirthdayLevel] = useState<CustomerLevel>(
    (product.birthdayPriceLevel as CustomerLevel) || "DIAMANTE",
  );

  useEffect(() => {
    if (!open) return;

    setBasePrice(String(product.priceAsNumber ?? ""));

    const lp = product.levelPrices ?? {};
    setLevelPrices({
      BRONZE: lp.BRONZE !== undefined ? String(lp.BRONZE) : "",
      PRATA: lp.PRATA !== undefined ? String(lp.PRATA) : "",
      OURO: lp.OURO !== undefined ? String(lp.OURO) : "",
      DIAMANTE: lp.DIAMANTE !== undefined ? String(lp.DIAMANTE) : "",
    });

    setBirthdayEnabled(Boolean(product.birthdayBenefitEnabled));
    setBirthdayLevel(
      ((product.birthdayPriceLevel as CustomerLevel) ||
        "DIAMANTE") as CustomerLevel,
    );
  }, [open, product]);

  const birthdayConfigInvalid = birthdayEnabled && !birthdayLevel;

  function handleUpdate(formData: FormData) {
    formData.set("birthdayBenefitEnabled", birthdayEnabled ? "true" : "false");
    if (birthdayEnabled) {
      formData.set("birthdayPriceLevel", birthdayLevel);
    } else {
      formData.delete("birthdayPriceLevel");
    }

    if (levelPrices.BRONZE.trim())
      formData.set("priceBronze", levelPrices.BRONZE);
    if (levelPrices.PRATA.trim()) formData.set("pricePrata", levelPrices.PRATA);
    if (levelPrices.OURO.trim()) formData.set("priceOuro", levelPrices.OURO);
    if (levelPrices.DIAMANTE.trim())
      formData.set("priceDiamante", levelPrices.DIAMANTE);

    startTransition(async () => {
      await updateProductWithId(formData);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
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

        <form action={handleUpdate} className="space-y-4 pb-2">
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

          <UploadImageField
            name="imageUrl"
            label="Foto do produto *"
            required
            defaultValue={product.imageUrl ?? ""}
            helperText="Essa imagem será exibida na listagem de produtos."
          />

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

          {/* ✅ FIX AQUI: sem defaultValue, só controlado */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Valor (R$) <span className="text-red-500">*</span>
            </label>
            <Input
              name="price"
              type="text"
              required
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
            <p className="text-xs text-content-secondary">
              Esse é o preço padrão (Bronze). Os demais níveis são opcionais.
            </p>
          </div>

          <PriceLevelGrid
            basePrice={basePrice}
            values={levelPrices}
            onChange={(level, value) =>
              setLevelPrices((prev) => ({ ...prev, [level]: value }))
            }
          />

          <div className="space-y-2 rounded-xl border border-border-primary bg-background-tertiary p-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-content-primary">
                  Benefício de aniversário
                </p>
                <p className="text-xs text-content-secondary">
                  Ativo por 3 dias antes, no dia, e 3 dias depois do aniversário
                  do cliente. Você escolhe qual “nível de preço” aplicar para
                  este produto.
                </p>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-content-secondary">
                <input
                  type="checkbox"
                  checked={birthdayEnabled}
                  onChange={(e) => setBirthdayEnabled(e.target.checked)}
                  className="h-4 w-4 accent-current"
                />
                Ativar
              </label>
            </div>

            {birthdayEnabled ? (
              <div className="space-y-1">
                <label className="text-xs text-content-secondary">
                  Aplicar preço como
                  <span className="text-red-500"> *</span>
                </label>

                <Select
                  value={birthdayLevel}
                  onValueChange={(v) => setBirthdayLevel(v as CustomerLevel)}
                >
                  <SelectTrigger className="bg-background-secondary border-border-primary text-content-primary">
                    <SelectValue placeholder="Selecione o nível" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVEL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {birthdayConfigInvalid ? (
                  <p className="text-xs text-red-500">
                    Se o benefício está ativo, selecione o nível.
                  </p>
                ) : (
                  <p className="text-xs text-content-secondary">
                    Ex.: “Diamante” aplica o preço Diamante deste produto
                    durante a janela do aniversário.
                  </p>
                )}

                <input
                  type="hidden"
                  name="birthdayBenefitEnabled"
                  value={birthdayEnabled ? "true" : "false"}
                />
                <input
                  type="hidden"
                  name="birthdayPriceLevel"
                  value={birthdayLevel}
                />
              </div>
            ) : (
              <input
                type="hidden"
                name="birthdayBenefitEnabled"
                value="false"
              />
            )}
          </div>

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
            <Button
              type="submit"
              variant="brand"
              disabled={isPending || birthdayConfigInvalid}
            >
              {isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
