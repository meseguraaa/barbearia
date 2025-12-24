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
            Se você deixar vazio, o sistema usa o preço normal (Bronze) como
            base.
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
        Dica: você pode preencher só alguns níveis. Os demais herdam por
        fallback (Diamante → Ouro → Prata → Bronze).
      </p>
    </div>
  );
}

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

  // ✅ NOVO: estado do benefício de aniversário (por produto)
  const [birthdayEnabled, setBirthdayEnabled] = useState(false);
  const [birthdayLevel, setBirthdayLevel] = useState<CustomerLevel>("DIAMANTE");

  // ✅ NOVO: estado de preços por nível (opcional)
  const [basePrice, setBasePrice] = useState("");
  const [levelPrices, setLevelPrices] = useState<Record<CustomerLevel, string>>(
    {
      BRONZE: "",
      PRATA: "",
      OURO: "",
      DIAMANTE: "",
    },
  );

  function handleCreate(formData: FormData) {
    // ✅ garante que unitId vai junto (estoque por unidade)
    formData.set("unitId", selectedUnitId);

    // ✅ benefício de aniversário
    formData.set("birthdayBenefitEnabled", birthdayEnabled ? "true" : "false");
    if (birthdayEnabled) {
      formData.set("birthdayPriceLevel", birthdayLevel);
    } else {
      formData.delete("birthdayPriceLevel");
    }

    // ✅ preços por nível (só manda os que o admin digitou)
    // (server action já garante BRONZE com base no price normal se ficar vazio)
    if (levelPrices.BRONZE.trim())
      formData.set("priceBronze", levelPrices.BRONZE);
    if (levelPrices.PRATA.trim()) formData.set("pricePrata", levelPrices.PRATA);
    if (levelPrices.OURO.trim()) formData.set("priceOuro", levelPrices.OURO);
    if (levelPrices.DIAMANTE.trim())
      formData.set("priceDiamante", levelPrices.DIAMANTE);

    startTransition(async () => {
      await createProductAction(formData);
      setOpen(false);

      // limpa estados quando fecha
      setBirthdayEnabled(false);
      setBirthdayLevel("DIAMANTE");
      setBasePrice("");
      setLevelPrices({ BRONZE: "", PRATA: "", OURO: "", DIAMANTE: "" });
    });
  }

  const hasUnits = units.length > 0;
  const unitIsLocked = !canSeeAllUnits && !!defaultUnitId;

  const birthdayConfigInvalid = birthdayEnabled && !birthdayLevel;

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
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
            />
            <p className="text-xs text-content-secondary">
              Esse é o preço padrão (Bronze). Os demais níveis são opcionais.
            </p>
          </div>

          {/* ✅ NOVO: PREÇOS POR NÍVEL */}
          <PriceLevelGrid
            basePrice={basePrice}
            values={levelPrices}
            onChange={(level, value) =>
              setLevelPrices((prev) => ({ ...prev, [level]: value }))
            }
          />

          {/* ✅ NOVO: BENEFÍCIO DE ANIVERSÁRIO (por produto) */}
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

                {/* inputs hidden (pra garantir submit mesmo se shadcn Select não gerar input nativo) */}
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
              <>
                <input
                  type="hidden"
                  name="birthdayBenefitEnabled"
                  value="false"
                />
              </>
            )}
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
                birthdayConfigInvalid ||
                (!unitIsLocked &&
                  (!selectedUnitId || selectedUnitId.length === 0))
              }
              title={
                birthdayConfigInvalid
                  ? "Selecione o nível do benefício de aniversário"
                  : !unitIsLocked &&
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
