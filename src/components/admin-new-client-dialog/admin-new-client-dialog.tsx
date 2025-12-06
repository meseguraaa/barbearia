// src/components/admin-new-client-dialog/admin-new-client-dialog.tsx
"use client";

import { FormEvent } from "react";
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

export function AdminNewClientDialog() {
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const form = e.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();

    if (!email) {
      toast.error("Informe um e-mail.");
      return;
    }

    try {
      const res = await fetch(
        `/api/admin/check-client-email?email=${encodeURIComponent(email)}`,
      );

      // se a rota der erro, tratamos com toast e não quebramos a tela
      if (!res.ok) {
        console.error(
          "Falha ao chamar /api/admin/check-client-email",
          res.status,
        );
        toast.error("Não foi possível validar o e-mail. Tente novamente.");
        return;
      }

      const data = (await res.json()) as { exists: boolean };

      if (data.exists) {
        toast.error("E-mail já cadastrado.");
        return;
      }

      // Se passou na validação, envia o form normalmente → dispara o server action
      form.submit();
    } catch (error) {
      console.error("Erro ao verificar e-mail:", error);
      toast.error("Não foi possível validar o e-mail. Tente novamente.");
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="brand">Novo cliente</Button>
      </DialogTrigger>

      <DialogContent className="bg-background-secondary border border-border-primary">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Novo cliente
          </DialogTitle>
        </DialogHeader>

        <form
          action={createClientAction}
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          {/* NOME */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="name"
            >
              Nome
            </label>
            <Input
              id="name"
              name="name"
              required
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* E-MAIL */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="email"
            >
              E-mail
            </label>
            <Input
              id="email"
              type="email"
              name="email"
              required
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* TELEFONE (obrigatório) */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="phone"
            >
              Telefone
            </label>
            <Input
              id="phone"
              name="phone"
              required
              className="bg-background-tertiary border-border-primary text-content-primary"
              placeholder="(11) 99999-9999"
            />
          </div>

          {/* DATA DE NASCIMENTO (dd/mm/aaaa) */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="birthday"
            >
              Data de nascimento
            </label>
            <Input
              id="birthday"
              name="birthday"
              placeholder="dd/mm/aaaa"
              required
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" variant="brand">
              Salvar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
