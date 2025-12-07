// components/professional-edit-dialog.tsx
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
import { UploadImageField } from "@/components/upload-image-field/upload-image-field";
import { updateBarber } from "@/app/admin/professional/actions";

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

export function ProfessionalEditDialog({
  barber,
}: {
  barber: ProfessionalForEdit;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [phone, setPhone] = useState(barber.phone ?? "");

  // 🔹 MÁSCARA TELEFONE
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

  function handleUpdate(formData: FormData) {
    startTransition(async () => {
      await updateBarber(formData);
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

          {/* FOTO (opcional) */}
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

          {/* SENHA (opcional) */}
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
            <p className="text-xs text-content-secondary/70">
              Deixe vazio para manter a senha atual.
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
