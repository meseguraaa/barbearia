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
import { updateClientAction } from "@/app/admin/clients/actions";
import { toast } from "sonner";
import { Calendar as CalendarIcon } from "lucide-react";

type AdminEditClientDialogProps = {
  client: {
    id: string;
    name: string;
    email: string;
    phone: string;
    birthday: Date | null;
  };
};

// máscara tel: (99) 99999-9999
function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatBirthdayToDisplay(date: Date | null): string {
  if (!date) return "";
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function isValidBirthdayDisplay(display: string): boolean {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(display);
}

export function AdminEditClientDialog({ client }: AdminEditClientDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(client.name ?? "");
  const [email, setEmail] = useState(client.email ?? "");
  const [phone, setPhone] = useState(formatPhone(client.phone ?? ""));
  const [birthdayInput, setBirthdayInput] = useState(
    formatBirthdayToDisplay(client.birthday),
  );

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const masked = formatPhone(e.target.value);
    setPhone(masked);
  }

  function handleBirthdayChange(e: React.ChangeEvent<HTMLInputElement>) {
    let value = e.target.value.replace(/\D/g, "").slice(0, 8);

    if (value.length >= 5) {
      value = value.replace(
        /(\d{2})(\d{2})(\d{0,4})/,
        (_, d, m, y) => `${d}/${m}/${y}`,
      );
    } else if (value.length >= 3) {
      value = value.replace(/(\d{2})(\d{0,2})/, (_, d, m) =>
        m ? `${d}/${m}` : d,
      );
    }

    setBirthdayInput(value);
  }

  function handleSubmit(formData: FormData) {
    // sobrescreve com os valores controlados
    formData.set("id", client.id);
    formData.set("name", name.trim());
    formData.set("email", email.trim());
    formData.set("phone", phone.trim());
    formData.set("birthday", birthdayInput.trim());

    if (!name.trim()) {
      toast.error("Informe o nome do cliente.");
      return;
    }

    if (!email.trim()) {
      toast.error("Informe o e-mail do cliente.");
      return;
    }

    if (!phone.trim()) {
      toast.error("Informe o telefone do cliente.");
      return;
    }

    if (!isValidBirthdayDisplay(birthdayInput)) {
      toast.error("Preencha a data de nascimento no formato DD/MM/AAAA.");
      return;
    }

    startTransition(async () => {
      const result = await updateClientAction(formData);

      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success("Cliente atualizado com sucesso!");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button
          variant="brand"
          size="sm"
          className="border-border-primary text-paragraph-small"
        >
          Editar
        </Button>
      </DialogTrigger>

      <DialogContent className="bg-background-secondary border border-border-primary">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Editar cliente
          </DialogTitle>
        </DialogHeader>

        <form action={handleSubmit} className="space-y-4">
          {/* NOME */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="client-name"
            >
              Nome <span className="text-red-500">*</span>
            </label>
            <Input
              id="client-name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isPending}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* E-MAIL */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="client-email"
            >
              E-mail <span className="text-red-500">*</span>
            </label>
            <Input
              id="client-email"
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isPending}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* TELEFONE */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="client-phone"
            >
              Telefone <span className="text-red-500">*</span>
            </label>
            <Input
              id="client-phone"
              name="phone"
              type="tel"
              placeholder="(99) 99999-9999"
              value={phone}
              onChange={handlePhoneChange}
              required
              disabled={isPending}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* DATA DE NASCIMENTO */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="client-birthday"
            >
              Data de nascimento <span className="text-red-500">*</span>
            </label>

            <div className="flex items-center gap-2 rounded-lg border border-border-primary bg-background-tertiary px-3 py-2 focus-within:ring-2 focus-within:ring-brand-primary">
              <CalendarIcon className="w-4 h-4 text-brand-primary" />
              <input
                id="client-birthday"
                name="birthday"
                type="text"
                inputMode="numeric"
                placeholder="DD/MM/AAAA"
                value={birthdayInput}
                onChange={handleBirthdayChange}
                disabled={isPending}
                className="flex-1 bg-transparent outline-none border-0 text-paragraph-small-size text-content-primary placeholder:text-content-tertiary"
              />
            </div>
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
