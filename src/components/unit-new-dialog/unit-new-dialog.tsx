// src/components/unit-new-dialog.tsx
"use client";

import React, {
  useEffect,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { createUnit, updateUnit } from "@/app/admin/settings/units/actions";

type UnitShape = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  isActive: boolean;
};

type UnitDialogMode = "create" | "edit";

type UnitDialogProps =
  | {
      mode?: "create";
      unit?: never;
      triggerLabel?: string;
      triggerVariant?: React.ComponentProps<typeof Button>["variant"];
      triggerSize?: React.ComponentProps<typeof Button>["size"];
    }
  | {
      mode: "edit";
      unit: UnitShape;
      triggerLabel?: string;
      triggerVariant?: React.ComponentProps<typeof Button>["variant"];
      triggerSize?: React.ComponentProps<typeof Button>["size"];
    };

function maskPhone(valueRaw: string): string {
  let value = valueRaw.replace(/\D/g, "").slice(0, 11);

  if (value.length <= 10) {
    value = value
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  } else {
    value = value
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{5})(\d)/, "$1-$2");
  }

  return value;
}

function UnitDialog(props: UnitDialogProps) {
  const {
    mode = "create",
    triggerLabel,
    triggerVariant = "brand",
    triggerSize,
  } = props;

  const isEdit = mode === "edit";
  const unit = isEdit ? props.unit : undefined; // ✅ narrow

  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [isActive, setIsActive] = useState(true);

  // ✅ Se por algum motivo chamarem edit sem unit, não quebra
  useEffect(() => {
    if (!open) return;

    if (isEdit) {
      if (!unit) return;

      setName(unit.name ?? "");
      setPhone(unit.phone ? maskPhone(unit.phone) : "");
      setAddress(unit.address ?? "");
      setIsActive(!!unit.isActive);
      return;
    }

    setName("");
    setPhone("");
    setAddress("");
    setIsActive(true);
  }, [open, isEdit, unit]);

  function handlePhoneChange(e: ChangeEvent<HTMLInputElement>) {
    setPhone(maskPhone(e.target.value));
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      formData.set("name", name);
      formData.set("phone", phone);
      formData.set("address", address);

      if (isEdit) {
        if (!unit) return; // ✅ garante não undefined
        formData.set("unitId", unit.id);
        formData.set("isActive", isActive ? "true" : "false");
        await updateUnit(formData);
      } else {
        await createUnit(formData);
      }

      setOpen(false);
    });
  }

  const title = isEdit ? "Editar unidade" : "Nova unidade";
  const submitLabel = isEdit ? "Salvar alterações" : "Criar unidade";
  const defaultTrigger =
    triggerLabel ?? (isEdit ? "Ajustar dados da unidade" : "Adicionar unidade");

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button
          variant={triggerVariant}
          size={triggerSize}
          className="border-border-primary hover:bg-muted/40"
        >
          {defaultTrigger}
        </Button>
      </DialogTrigger>

      <DialogContent className="bg-background-secondary border border-border-primary max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            {title}
          </DialogTitle>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4 pb-2">
          {/* hidden só pra ficar explícito no HTML (opcional) */}
          {isEdit && unit ? (
            <input type="hidden" name="unitId" value={unit.id} />
          ) : null}

          {/* NOME */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Nome da unidade <span className="text-red-500">*</span>
            </label>
            <Input
              name="name"
              required
              placeholder="Ex: Unidade Centro"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-background-tertiary border-border-primary text-content-primary"
              disabled={isPending}
            />
          </div>

          {/* TELEFONE */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Telefone
            </label>
            <Input
              name="phone"
              placeholder="(99) 99999-9999"
              value={phone}
              onChange={handlePhoneChange}
              className="bg-background-tertiary border-border-primary text-content-primary"
              disabled={isPending}
            />
          </div>

          {/* ENDEREÇO */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Endereço
            </label>
            <Input
              name="address"
              placeholder="Rua, número, bairro, cidade - UF"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="bg-background-tertiary border-border-primary text-content-primary"
              disabled={isPending}
            />
          </div>

          {/* ATIVA */}
          {isEdit ? (
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border-primary bg-background-tertiary px-3 py-2">
              <span className="text-sm text-content-primary">
                Unidade ativa
              </span>
              <input
                type="checkbox"
                name="isActive"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="accent-brand-primary"
                disabled={isPending}
              />
            </label>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" variant="brand" disabled={isPending}>
              {isPending ? "Salvando..." : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ✅ Mantém compatibilidade: botão “Adicionar unidade”
export function UnitNewDialog() {
  return <UnitDialog mode="create" />;
}

// ✅ Novo: botão para editar uma unidade específica
export function UnitEditDialog({
  unit,
  triggerLabel,
  triggerVariant = "outline",
  triggerSize = "sm",
}: {
  unit: UnitShape;
  triggerLabel?: string;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerSize?: React.ComponentProps<typeof Button>["size"];
}) {
  return (
    <UnitDialog
      mode="edit"
      unit={unit}
      triggerLabel={triggerLabel}
      triggerVariant={triggerVariant}
      triggerSize={triggerSize}
    />
  );
}
