// components/admin-new-client-dialog/admin-new-client-dialog.tsx
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
import { createClientAction } from "@/app/admin/clients/actions";

// máscara (99) 99999-9999
function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11); // até 11 dígitos

  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function AdminNewClientDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [phone, setPhone] = useState("");

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const masked = formatPhone(e.target.value);
    setPhone(masked);
  }

  function handleCreate(formData: FormData) {
    // garante que o valor que vai pra action está mascarado
    formData.set("phone", phone);

    startTransition(async () => {
      await createClientAction(formData);
      // se a action não lançar erro, fechamos o modal
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="brand">Novo cliente</Button>
      </DialogTrigger>

      <DialogContent className="bg-background-secondary border border-border-primary">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Novo cliente
          </DialogTitle>
        </DialogHeader>

        <form action={handleCreate} className="space-y-4">
          {/* NOME */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="name"
            >
              Nome <span className="text-red-500">*</span>
            </label>
            <Input
              id="name"
              name="name"
              required
              disabled={isPending}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* E-MAIL */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="email"
            >
              E-mail <span className="text-red-500">*</span>
            </label>
            <Input
              id="email"
              type="email"
              name="email"
              required
              disabled={isPending}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* TELEFONE */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="phone"
            >
              Telefone <span className="text-red-500">*</span>
            </label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              required
              placeholder="(99) 99999-9999"
              value={phone}
              onChange={handlePhoneChange}
              disabled={isPending}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* se quiser adicionar aniversário depois, dá pra vir aqui */}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" variant="brand" disabled={isPending}>
              {isPending ? "Salvando..." : "Criar cliente"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
