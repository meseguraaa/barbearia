"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBarber } from "@/app/admin/professional/actions";

export function ProfessionalNewDialog() {
  const [phone, setPhone] = useState("");

  // 🔹 MÁSCARA: (99) 99999-9999 (ou (99) 9999-9999 se tiver 10 dígitos)
  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    let value = e.target.value.replace(/\D/g, "").slice(0, 11);

    if (value.length <= 10) {
      // (99) 9999-9999
      value = value
        .replace(/(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{4})(\d)/, "$1-$2");
    } else {
      // (99) 99999-9999
      value = value
        .replace(/(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{5})(\d)/, "$1-$2");
    }

    setPhone(value);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="brand">Novo profissional</Button>
      </DialogTrigger>

      <DialogContent className="bg-background-secondary border border-border-primary">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Novo profissional
          </DialogTitle>
        </DialogHeader>

        {/* 🔹 Aqui o pulo do gato: cast no tipo do action pra satisfazer o TS */}
        <form
          action={
            createBarber as unknown as (
              formData: FormData,
            ) => void | Promise<void>
          }
          className="space-y-4"
        >
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
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* TELEFONE — OBRIGATÓRIO */}
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
              required
              placeholder="(99) 99999-9999"
              value={phone}
              onChange={handlePhoneChange}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* SENHA */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="password"
            >
              Senha do profissional <span className="text-red-500">*</span>
            </label>
            <Input
              id="password"
              type="password"
              name="password"
              required
              placeholder="Defina a senha de acesso do profissional"
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
