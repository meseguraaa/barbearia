// components/professional-new-dialog.tsx
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
import { createBarber } from "@/app/admin/professional/actions";

export function ProfessionalNewDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [phone, setPhone] = useState("");

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

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      await createBarber(formData);
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="brand">Novo profissional</Button>
      </DialogTrigger>

      <DialogContent className="bg-background-secondary border border-border-primary max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Novo profissional
          </DialogTitle>
        </DialogHeader>

        <form action={handleCreate} className="space-y-4 pb-2">
          {/* NOME */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Nome <span className="text-red-500">*</span>
            </label>
            <Input
              name="name"
              required
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* FOTO (opcional) */}
          <UploadImageField
            name="imageUrl"
            label="Foto do profissional"
            defaultValue=""
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
              Senha <span className="text-red-500">*</span>
            </label>
            <Input
              type="password"
              name="password"
              required
              placeholder="Defina a senha do profissional"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" variant="brand" disabled={isPending}>
              {isPending ? "Salvando..." : "Criar profissional"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
