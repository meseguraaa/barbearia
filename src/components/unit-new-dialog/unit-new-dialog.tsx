// components/unit-new-dialog.tsx
"use client";

import { useState, useTransition } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { createUnit } from "@/app/admin/settings/units/actions";

export function UnitNewDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [phone, setPhone] = useState("");

  // 🔹 MÁSCARA TELEFONE (igual teu padrão)
  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    let value = e.target.value.replace(/\D/g, "").slice(0, 11);

    if (value.length <= 10) {
      value = value
        .replace(/(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{4})(\d)/, "$1-$2");
    } else {
      value = value
        .replace(/(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{5})(\d)/, "$1-$2");
    }

    setPhone(value);
  }

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      // input controlado -> garante o valor no formData
      formData.set("phone", phone);

      await createUnit(formData);
      setOpen(false);
      setPhone("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button
          variant="brand"
          className="border-border-primary hover:bg-muted/40"
        >
          Adicionar unidade
        </Button>
      </DialogTrigger>

      <DialogContent className="bg-background-secondary border border-border-primary max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Nova unidade
          </DialogTitle>
        </DialogHeader>

        <form action={handleCreate} className="space-y-4 pb-2">
          {/* NOME */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Nome da unidade <span className="text-red-500">*</span>
            </label>
            <Input
              name="name"
              required
              placeholder="Ex: Unidade Centro"
              className="bg-background-tertiary border-border-primary text-content-primary"
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
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" variant="brand" disabled={isPending}>
              {isPending ? "Salvando..." : "Criar unidade"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
