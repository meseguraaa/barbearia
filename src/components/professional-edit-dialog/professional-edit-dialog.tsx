// components/professional-edit-dialog.tsx
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
import { UploadImageField } from "@/components/upload-image-field/upload-image-field";
import { updateBarber } from "@/app/admin/professional/actions";
import { toast } from "sonner";

type ProfessionalForEdit = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  userId: string | null;
  imageUrl: string | null;
};

type UnitOption = {
  id: string;
  name: string;
  isActive: boolean;
};

export function ProfessionalEditDialog({
  barber,
  units,
  selectedUnitIds,
}: {
  barber: ProfessionalForEdit;
  units: UnitOption[];
  selectedUnitIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [phone, setPhone] = useState(barber.phone ?? "");
  const [unitIds, setUnitIds] = useState<string[]>(selectedUnitIds ?? []);

  const selectedCountLabel = useMemo(() => {
    if (unitIds.length === 0) return "Nenhuma selecionada";
    if (unitIds.length === 1) return "1 unidade selecionada";
    return `${unitIds.length} unidades selecionadas`;
  }, [unitIds.length]);

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

  function toggleUnit(id: string) {
    setUnitIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleUpdate(formData: FormData) {
    if (unitIds.length === 0) {
      toast.error(
        "O profissional precisa estar vinculado a pelo menos 1 unidade.",
      );
      return;
    }

    unitIds.forEach((id) => formData.append("unitIds", id));

    startTransition(async () => {
      const res = await updateBarber(formData);

      if (!res?.ok) {
        toast.error(res?.error ?? "Erro ao salvar alterações.");
        return; // ✅ não fecha o modal
      }

      toast.success("Alterações salvas!");
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
            Editar profissional
          </DialogTitle>
        </DialogHeader>

        <form action={handleUpdate} className="space-y-4 pb-2">
          <input type="hidden" name="id" value={barber.id} />

          {/* UNIDADES (obrigatório) */}
          <div className="space-y-2">
            <label className="text-label-small text-content-secondary">
              Unidades <span className="text-red-500">*</span>
            </label>

            <div className="rounded-xl border border-border-primary bg-background-tertiary p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-content-secondary">
                  Selecione onde este profissional pode atuar.
                </p>
                <p className="text-xs text-content-secondary">
                  {selectedCountLabel}
                </p>
              </div>

              <div className="grid gap-2">
                {units.map((u) => {
                  const checked = unitIds.includes(u.id);
                  return (
                    <label
                      key={u.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border-primary bg-background-secondary px-3 py-2 cursor-pointer"
                    >
                      <div className="flex flex-col">
                        <span className="text-sm text-content-primary font-medium">
                          {u.name}
                        </span>
                        <span className="text-[11px] text-content-secondary">
                          Unidade ativa
                        </span>
                      </div>

                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleUnit(u.id)}
                        className="h-4 w-4 accent-current"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* NOME */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Nome <span className="text-red-500">*</span>
            </label>
            <Input
              name="name"
              required
              defaultValue={barber.name ?? ""}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* FOTO */}
          <UploadImageField
            name="imageUrl"
            label="Foto do profissional"
            defaultValue={barber.imageUrl ?? ""}
            helperText="Essa imagem será exibida na listagem de profissionais."
          />

          {/* E-MAIL */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              E-mail <span className="text-red-500">*</span>
            </label>
            <Input
              type="email"
              name="email"
              required
              defaultValue={barber.email}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* TELEFONE */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Telefone <span className="text-red-500">*</span>
            </label>
            <Input
              name="phone"
              required
              placeholder="(99) 99999-9999"
              value={phone}
              onChange={handlePhoneChange}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* SENHA */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Nova senha
            </label>
            <Input
              type="password"
              name="password"
              placeholder="Preencha para alterar a senha"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
            <p className="text-[11px] text-content-secondary">
              Deixe vazio para manter a senha atual. Se preencher: mín. 6, 1
              maiúscula, 1 número e 1 especial (!@#$%^&*()_+-=[]{}
              ;':&quot;,.&lt;&gt;/?\|)
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" variant="brand" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
