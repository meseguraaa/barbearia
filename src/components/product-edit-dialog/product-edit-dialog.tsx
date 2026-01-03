// src/components/product-edit-dialog/product-edit-dialog.tsx
"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";

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
import {
  getProductPricing,
  updateProductAction,
} from "@/app/admin/products/actions";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

// ✅ ESTE TYPE PRECISA BATER COM O QUE O page.tsx MANDA PRA <ProductRow />
export type ProductForRow = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;

  price: number;
  barberPercentage: number | null;

  stockQuantity: number;
  category: string | null;
  isActive: boolean;

  unitId?: string | null;
  unitName?: string | null;

  pickupDeadlineDays?: number | null;

  birthdayBenefitEnabled?: boolean;
  birthdayPriceLevel?: CustomerLevel | null;

  // descontos por nível (%)
  levelDiscounts?: Partial<Record<CustomerLevel, number>>;

  isFeatured?: boolean;
};

type ProductEditDialogProps = {
  product: ProductForRow;
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
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = toNumberLoose(s);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.floor(n)));
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
            Ouro → Prata → Bronze). Vazio = 0% no submit.
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
        Regra B: campo vazio vira 0% no submit (o servidor recebe 0).
      </p>
    </div>
  );
}

function toLevelDiscountState(
  ld: Partial<Record<CustomerLevel, number>> | undefined,
): Record<CustomerLevel, string> {
  const norm = (v: number | undefined) => (v && v > 0 ? String(v) : "");
  return {
    BRONZE: norm(ld?.BRONZE),
    PRATA: norm(ld?.PRATA),
    OURO: norm(ld?.OURO),
    DIAMANTE: norm(ld?.DIAMANTE),
  };
}

function hasAnyDiscountKey(ld: unknown): ld is Record<string, unknown> {
  return !!ld && typeof ld === "object" && Object.keys(ld as any).length > 0;
}

export function ProductEditDialog({ product }: ProductEditDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const pickupDeadlineDaysDefault =
    typeof product.pickupDeadlineDays === "number" &&
    product.pickupDeadlineDays > 0
      ? product.pickupDeadlineDays
      : 2;

  const unitLabel = product.unitName || "—";

  const [basePrice, setBasePrice] = useState<string>(() =>
    String(product.price ?? ""),
  );

  const [levelDiscounts, setLevelDiscounts] = useState<
    Record<CustomerLevel, string>
  >(() => toLevelDiscountState(product.levelDiscounts));

  const [birthdayEnabled, setBirthdayEnabled] = useState<boolean>(() =>
    Boolean(product.birthdayBenefitEnabled),
  );

  // ✅ se habilitar, sempre existe um nível válido (default DIAMANTE)
  const [birthdayLevel, setBirthdayLevel] = useState<CustomerLevel>(() => {
    return (product.birthdayPriceLevel as CustomerLevel) || "DIAMANTE";
  });

  const [isFeatured, setIsFeatured] = useState<boolean>(() =>
    Boolean(product.isFeatured),
  );

  const [barberPercentage, setBarberPercentage] = useState<string>(() => {
    const v = product.barberPercentage;
    return v === null || v === undefined ? "" : String(v);
  });

  // ✅ como birthdayLevel sempre é válido, inválido só se o form estiver bugado
  const birthdayConfigInvalid = birthdayEnabled && !birthdayLevel;

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    // ✅ abre SEMPRE preenchido com o que veio do page.tsx
    setBasePrice(String(product.price ?? ""));
    setLevelDiscounts(toLevelDiscountState(product.levelDiscounts));
    setBirthdayEnabled(Boolean(product.birthdayBenefitEnabled));
    setBirthdayLevel(
      (product.birthdayPriceLevel as CustomerLevel) || "DIAMANTE",
    );
    setIsFeatured(Boolean(product.isFeatured));
    setBarberPercentage(() => {
      const v = product.barberPercentage;
      return v === null || v === undefined ? "" : String(v);
    });

    // ✅ server: só sobrescreve se vier algo útil mesmo
    (async () => {
      try {
        const pricing = await getProductPricing(product.id);
        if (cancelled) return;

        // descontos: só aplica se vier pelo menos 1 chave
        if (hasAnyDiscountKey((pricing as any)?.levelDiscounts)) {
          setLevelDiscounts(
            toLevelDiscountState((pricing as any).levelDiscounts),
          );
        }

        // aniversário
        if (typeof (pricing as any)?.birthdayBenefitEnabled === "boolean") {
          setBirthdayEnabled(Boolean((pricing as any).birthdayBenefitEnabled));
        }
        if ((pricing as any)?.birthdayPriceLevel) {
          setBirthdayLevel(
            ((pricing as any).birthdayPriceLevel ||
              "DIAMANTE") as CustomerLevel,
          );
        }

        // destaque
        if (typeof (pricing as any)?.isFeatured === "boolean") {
          setIsFeatured((pricing as any).isFeatured);
        }

        // comissão
        const bp = (pricing as any)?.barberPercentage;
        if (bp !== undefined) {
          setBarberPercentage(bp === null ? "" : String(bp));
        }
      } catch {
        // mantém fallback (sem apagar state)
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    product.id,
    product.price,
    product.levelDiscounts,
    product.birthdayBenefitEnabled,
    product.birthdayPriceLevel,
    product.isFeatured,
    product.barberPercentage,
  ]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const form = e.currentTarget;
    const formData = new FormData(form);

    // ✅ destaque
    formData.set("isFeatured", isFeatured ? "true" : "false");

    // ✅ aniversário
    formData.set("birthdayBenefitEnabled", birthdayEnabled ? "true" : "false");
    formData.set("birthdayPriceLevel", birthdayEnabled ? birthdayLevel : "");

    // ✅ regra B: campo vazio = 0% (sempre envia)
    const bronze = clampPct(levelDiscounts.BRONZE) ?? 0;
    const prata = clampPct(levelDiscounts.PRATA) ?? 0;
    const ouro = clampPct(levelDiscounts.OURO) ?? 0;
    const diamante = clampPct(levelDiscounts.DIAMANTE) ?? 0;

    formData.set("discountBronzePct", String(bronze));
    formData.set("discountPrataPct", String(prata));
    formData.set("discountOuroPct", String(ouro));
    formData.set("discountDiamantePct", String(diamante));

    // ✅ comissão controlada
    formData.set("barberPercentage", barberPercentage);

    startTransition(async () => {
      await updateProductAction(product.id, formData);
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

        <form onSubmit={handleSubmit} className="space-y-4 pb-2">
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

            {/* mantém compatibilidade caso alguém dependa do HTML form */}
            <input
              type="hidden"
              name="isFeatured"
              value={isFeatured ? "true" : "false"}
            />
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

          {/* preço controlado */}
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
                  value="true"
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
                <input type="hidden" name="birthdayPriceLevel" value="" />
              </>
            )}
          </div>

          {/* comissão */}
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
              value={barberPercentage}
              onChange={(e) => setBarberPercentage(e.target.value)}
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
