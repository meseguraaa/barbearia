"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

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
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function AdminNewClientDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const formRef = useRef<HTMLFormElement | null>(null);

  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState(""); // yyyy-MM-dd (input type="date")

  function resetAll() {
    setPhone("");
    setBirthday("");
    formRef.current?.reset(); // limpa name/email (uncontrolled)
  }

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPhone(formatPhone(e.target.value));
  }

  function handleCreate(formData: FormData) {
    const digits = onlyDigits(phone);

    if (digits.length !== 11) {
      toast.error("Informe um telefone válido com DDD (11 dígitos).");
      return;
    }

    if (!birthday) {
      toast.error("Preencha a data de nascimento.");
      return;
    }

    // envia como o usuário vê (action normaliza)
    formData.set("phone", phone);
    formData.set("birthday", birthday);

    startTransition(async () => {
      const result = await createClientAction(formData);

      if (result?.error) {
        toast.error(result.error);
        return; // não fecha o modal
      }

      toast.success("Cliente criado com sucesso!");
      setOpen(false);
      resetAll();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        setOpen(next);

        // se fechou manualmente, limpa pra não reabrir “sujo”
        if (!next) resetAll();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="brand">Novo cliente</Button>
      </DialogTrigger>

      <DialogContent className="bg-background-secondary border border-border-primary">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Novo cliente
          </DialogTitle>
        </DialogHeader>

        <form ref={formRef} action={handleCreate} className="space-y-4">
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
            <p className="text-[11px] text-content-tertiary">
              Ex.: (11) 99999-9999
            </p>
          </div>

          {/* ANIVERSÁRIO */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="birthday"
            >
              Data de nascimento <span className="text-red-500">*</span>
            </label>
            <Input
              id="birthday"
              name="birthday"
              type="date"
              required
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              disabled={isPending}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
            <p className="text-[11px] text-content-tertiary">
              Usamos essa data para aniversários e relatórios.
            </p>
          </div>

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
