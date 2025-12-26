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

const LEVEL_FALLBACK: Record<CustomerLevel, CustomerLevel[]> = {
  DIAMANTE: ["DIAMANTE", "OURO", "PRATA", "BRONZE"],
  OURO: ["OURO", "PRATA", "BRONZE"],
  PRATA: ["PRATA", "BRONZE"],
  BRONZE: ["BRONZE"],
};

function toNumberLoose(raw: string): number {
  const clean = String(raw ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  const n = Number(clean);
  return Number.isFinite(n) ? n : NaN;
}

function clampPct(raw: string): number | null {
  const n = toNumberLoose(raw);
  if (!Number.isFinite(n)) return null;
  const v = Math.max(0, Math.min(100, Math.floor(n)));
  return v;
}

function fmtMoney(n: number) {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2).replace(".", ",");
}

function calcFinal(basePrice: number, pct: number) {
  const final = basePrice * (1 - pct / 100);
  return Math.round((final + Number.EPSILON) * 100) / 100;
}

function pickDiscountPct(
  level: CustomerLevel,
  values: Record<CustomerLevel, string>,
) {
  for (const l of LEVEL_FALLBACK[level]) {
    const pct = clampPct(values[l]);
    if (pct !== null) return { appliedLevel: l, pct };
  }
  return { appliedLevel: "BRONZE" as CustomerLevel, pct: 0 };
}

function DiscountLevelGrid({
  basePrice,
  values,
  onChange,
}: {
  basePrice: string;
  values: Record<CustomerLevel, string>;
  onChange: (level: CustomerLevel, value: string) => void;
}) {
  const base = toNumberLoose(basePrice);

  const preview = useMemo(() => {
    if (!Number.isFinite(base)) {
      return {
        BRONZE: { pct: clampPct(values.BRONZE) ?? 0, final: NaN, save: NaN },
        PRATA: { pct: clampPct(values.PRATA) ?? 0, final: NaN, save: NaN },
        OURO: { pct: clampPct(values.OURO) ?? 0, final: NaN, save: NaN },
        DIAMANTE: {
          pct: clampPct(values.DIAMANTE) ?? 0,
          final: NaN,
          save: NaN,
        },
      } satisfies Record<
        CustomerLevel,
        { pct: number; final: number; save: number }
      >;
    }

    const out: any = {};
    (["BRONZE", "PRATA", "OURO", "DIAMANTE"] as CustomerLevel[]).forEach(
      (lvl) => {
        const picked = pickDiscountPct(lvl, values);
        const final = calcFinal(base, picked.pct);
        const save = Math.max(0, base - final);
        out[lvl] = {
          pct: picked.pct,
          final,
          save,
          appliedLevel: picked.appliedLevel,
        };
      },
    );

    return out as Record<
      CustomerLevel,
      { pct: number; final: number; save: number; appliedLevel: CustomerLevel }
    >;
  }, [base, values]);

  return (
    <div className="space-y-2 rounded-xl border border-border-primary bg-background-tertiary p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-content-primary">
            Desconto por nível (%)
          </p>
          <p className="text-xs text-content-secondary">
            Deixe vazio para não definir. O sistema usa fallback (Diamante →
            Ouro → Prata → Bronze). Vazio no Bronze = 0%.
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
            name="discountBronzePct"
            inputMode="numeric"
            placeholder="Ex: 5"
            value={values.BRONZE}
            onChange={(e) => onChange("BRONZE", e.target.value)}
            className="bg-background-secondary border-border-primary text-content-primary"
          />
          <p className="text-[11px] text-content-secondary">
            Final:{" "}
            <span className="text-content-primary">
              R$ {fmtMoney(preview.BRONZE.final)}
            </span>
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-content-secondary">Prata</label>
          <Input
            name="discountPrataPct"
            inputMode="numeric"
            placeholder="Ex: 8"
            value={values.PRATA}
            onChange={(e) => onChange("PRATA", e.target.value)}
            className="bg-background-secondary border-border-primary text-content-primary"
          />
          <p className="text-[11px] text-content-secondary">
            Final:{" "}
            <span className="text-content-primary">
              R$ {fmtMoney(preview.PRATA.final)}
            </span>
            {Number.isFinite(preview.PRATA.save) && preview.PRATA.save > 0 ? (
              <span className="text-content-secondary">
                {" "}
                (economiza R$ {fmtMoney(preview.PRATA.save)})
              </span>
            ) : null}
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-content-secondary">Ouro</label>
          <Input
            name="discountOuroPct"
            inputMode="numeric"
            placeholder="Ex: 10"
            value={values.OURO}
            onChange={(e) => onChange("OURO", e.target.value)}
            className="bg-background-secondary border-border-primary text-content-primary"
          />
          <p className="text-[11px] text-content-secondary">
            Final:{" "}
            <span className="text-content-primary">
              R$ {fmtMoney(preview.OURO.final)}
            </span>
            {Number.isFinite(preview.OURO.save) && preview.OURO.save > 0 ? (
              <span className="text-content-secondary">
                {" "}
                (economiza R$ {fmtMoney(preview.OURO.save)})
              </span>
            ) : null}
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-content-secondary">Diamante</label>
          <Input
            name="discountDiamantePct"
            inputMode="numeric"
            placeholder="Ex: 15"
            value={values.DIAMANTE}
            onChange={(e) => onChange("DIAMANTE", e.target.value)}
            className="bg-background-secondary border-border-primary text-content-primary"
          />
          <p className="text-[11px] text-content-secondary">
            Final:{" "}
            <span className="text-content-primary">
              R$ {fmtMoney(preview.DIAMANTE.final)}
            </span>
            {Number.isFinite(preview.DIAMANTE.save) &&
            preview.DIAMANTE.save > 0 ? (
              <span className="text-content-secondary">
                {" "}
                (economiza R$ {fmtMoney(preview.DIAMANTE.save)})
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <p className="text-[11px] text-content-secondary">
        Dica: se você preencher só o Diamante, ele cai pro Ouro/Prata/Bronze
        quando faltar. Bronze vazio vira 0%.
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

  // ✅ benefício de aniversário
  const [birthdayEnabled, setBirthdayEnabled] = useState(false);
  const [birthdayLevel, setBirthdayLevel] = useState<CustomerLevel>("DIAMANTE");

  // ✅ descontos por nível (opcional)
  const [basePrice, setBasePrice] = useState("");
  const [levelDiscounts, setLevelDiscounts] = useState<
    Record<CustomerLevel, string>
  >({
    BRONZE: "",
    PRATA: "",
    OURO: "",
    DIAMANTE: "",
  });

  // ✅ destaque
  const [isFeatured, setIsFeatured] = useState(false);

  function handleCreate(formData: FormData) {
    // ✅ unitId (garante)
    formData.set("unitId", selectedUnitId);

    // ✅ destaque
    formData.set("isFeatured", isFeatured ? "true" : "false");

    // ✅ benefício de aniversário
    formData.set("birthdayBenefitEnabled", birthdayEnabled ? "true" : "false");
    if (birthdayEnabled) {
      formData.set("birthdayPriceLevel", birthdayLevel);
    } else {
      formData.delete("birthdayPriceLevel");
    }

    // ✅ descontos: envia sempre (mesmo vazio) pra permitir "limpar" depois no server
    formData.set("discountBronzePct", levelDiscounts.BRONZE);
    formData.set("discountPrataPct", levelDiscounts.PRATA);
    formData.set("discountOuroPct", levelDiscounts.OURO);
    formData.set("discountDiamantePct", levelDiscounts.DIAMANTE);

    startTransition(async () => {
      await createProductAction(formData);
      setOpen(false);

      setBirthdayEnabled(false);
      setBirthdayLevel("DIAMANTE");
      setBasePrice("");
      setLevelDiscounts({ BRONZE: "", PRATA: "", OURO: "", DIAMANTE: "" });
      setIsFeatured(false);
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

                <input type="hidden" name="unitId" value={selectedUnitId} />
                <p className="text-xs text-content-secondary">
                  O estoque não é central. Reservas e checkout seguirão a
                  unidade escolhida.
                </p>
              </>
            )}
          </div>

          {/* ✅ DESTAQUE */}
          <div className="space-y-2 rounded-xl border border-border-primary bg-background-tertiary p-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-content-primary">
                  ⭐ Destaque no app
                </p>
                <p className="text-xs text-content-secondary">
                  Quando ativo, este produto aparece no carrossel de Destaques
                  no app.
                </p>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-content-secondary">
                <input
                  type="checkbox"
                  checked={isFeatured}
                  onChange={(e) => setIsFeatured(e.target.checked)}
                  className="h-4 w-4 accent-current"
                />
                Ativar
              </label>
            </div>

            <input
              type="hidden"
              name="isFeatured"
              value={isFeatured ? "true" : "false"}
            />
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

          {/* FOTO */}
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
              Esse é o preço cheio (base). Os descontos por nível são opcionais.
            </p>
          </div>

          <DiscountLevelGrid
            basePrice={basePrice}
            values={levelDiscounts}
            onChange={(level, value) =>
              setLevelDiscounts((prev) => ({ ...prev, [level]: value }))
            }
          />

          {/* BENEFÍCIO DE ANIVERSÁRIO */}
          <div className="space-y-2 rounded-xl border border-border-primary bg-background-tertiary p-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-content-primary">
                  Benefício de aniversário
                </p>
                <p className="text-xs text-content-secondary">
                  Ativo por 3 dias antes, no dia, e 3 dias depois do aniversário
                  do cliente. Você escolhe qual “nível” (desconto) aplicar para
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
                  Aplicar desconto como <span className="text-red-500">*</span>
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
                    Ex.: “Diamante” aplica o desconto Diamante deste produto
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

          {/* PORCENTAGEM */}
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

          {/* CATEGORIA */}
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

          {/* PRAZO */}
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
