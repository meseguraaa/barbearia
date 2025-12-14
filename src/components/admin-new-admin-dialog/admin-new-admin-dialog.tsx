"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar as CalendarIcon } from "lucide-react";
import { createAdminAction } from "@/app/admin/settings/actions";
import { toast } from "sonner";

// 🔢 Máscara de telefone: (00) 00000-0000
function formatPhoneDisplay(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11); // 2 + 5 + 4 = 11 dígitos

  if (digits.length === 0) return "";

  if (digits.length <= 2) {
    return `(${digits}`;
  }

  if (digits.length <= 7) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function isValidBirthdayDisplay(display: string): boolean {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(display);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function AdminNewAdminDialog() {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthdayInput, setBirthdayInput] = useState(""); // "DD/MM/AAAA"
  const [password, setPassword] = useState("");

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatPhoneDisplay(e.target.value);
    setPhone(formatted);
  }

  function handleBirthdayChange(e: React.ChangeEvent<HTMLInputElement>) {
    let value = e.target.value;

    value = value.replace(/\D/g, "");
    if (value.length > 8) value = value.slice(0, 8);

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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);

      if (!name.trim()) {
        toast.error("Preencha o nome do administrador.");
        return;
      }

      if (!email.trim()) {
        toast.error("Preencha o e-mail.");
        return;
      }

      if (!isValidEmail(email.trim())) {
        toast.error("Preencha um e-mail válido.");
        return;
      }

      if (!phone.trim()) {
        toast.error("Preencha o telefone.");
        return;
      }

      if (!birthdayInput.trim()) {
        toast.error("Preencha a data de nascimento.");
        return;
      }

      if (!isValidBirthdayDisplay(birthdayInput)) {
        toast.error("Preencha a data de nascimento no formato DD/MM/AAAA.");
        return;
      }

      if (!password.trim()) {
        toast.error("Preencha a senha.");
        return;
      }

      if (password.trim().length < 6) {
        toast.error("A senha deve ter pelo menos 6 caracteres.");
        return;
      }

      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("email", email.trim());
      formData.append("phone", phone.trim());
      formData.append("birthday", birthdayInput.trim());
      formData.append("password", password.trim());

      const result = await createAdminAction(formData);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("Administrador criado com sucesso!");
      setOpen(false);
      setName("");
      setEmail("");
      setPhone("");
      setBirthdayInput("");
      setPassword("");
    } catch (error) {
      console.error("Erro ao criar admin", error);
      toast.error("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  const descriptionText =
    "Cadastre um novo administrador para o painel e depois ajuste as permissões de acesso.";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="brand">Novo admin</Button>
      </DialogTrigger>

      <DialogContent
        variant="appointment"
        overlayVariant="blurred"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle size="modal">Novo administrador</DialogTitle>
          <DialogDescription size="modal">{descriptionText}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <form onSubmit={handleSave} className="space-y-4">
            {/* 🧍 Nome */}
            <div className="space-y-2">
              <label
                htmlFor="admin-name"
                className="text-label-small-size text-content-primary flex items-center gap-1"
              >
                Nome completo
                <span className="text-red-500">*</span>
              </label>
              <Input
                id="admin-name"
                name="name"
                type="text"
                placeholder="Nome do administrador"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
                className="bg-background-tertiary border-border-primary text-content-primary placeholder:text-content-tertiary"
              />
            </div>

            {/* 📧 E-mail */}
            <div className="space-y-2">
              <label
                htmlFor="admin-email"
                className="text-label-small-size text-content-primary flex items-center gap-1"
              >
                E-mail
                <span className="text-red-500">*</span>
              </label>
              <Input
                id="admin-email"
                name="email"
                type="email"
                placeholder="email@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={saving}
                className="bg-background-tertiary border-border-primary text-content-primary placeholder:text-content-tertiary"
              />
            </div>

            {/* 🔐 Senha */}
            <div className="space-y-2">
              <label
                htmlFor="admin-password"
                className="text-label-small-size text-content-primary flex items-center gap-1"
              >
                Senha de acesso
                <span className="text-red-500">*</span>
              </label>
              <Input
                id="admin-password"
                name="password"
                type="password"
                placeholder="Defina uma senha para o admin"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={saving}
                className="bg-background-tertiary border-border-primary text-content-primary placeholder:text-content-tertiary"
              />
              <p className="text-[11px] text-content-tertiary">
                A senha deve ter pelo menos 6 caracteres.
              </p>
            </div>

            {/* 📞 Telefone */}
            <div className="space-y-2">
              <label
                htmlFor="admin-phone"
                className="text-label-small-size text-content-primary flex items-center gap-1"
              >
                Telefone
                <span className="text-red-500">*</span>
              </label>
              <Input
                id="admin-phone"
                name="phone"
                type="tel"
                placeholder="(00) 00000-0000"
                value={phone}
                onChange={handlePhoneChange}
                disabled={saving}
                className="bg-background-tertiary border-border-primary text-content-primary placeholder:text-content-tertiary"
              />
            </div>

            {/* 🎂 Data de nascimento */}
            <div className="space-y-2">
              <label
                htmlFor="admin-birthday"
                className="text-label-small-size text-content-primary flex items-center gap-1"
              >
                Data de nascimento
                <span className="text-red-500">*</span>
              </label>

              <div className="relative">
                <CalendarIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-border-primary" />
                <Input
                  id="admin-birthday"
                  name="birthday"
                  type="text"
                  inputMode="numeric"
                  placeholder="DD/MM/AAAA"
                  value={birthdayInput}
                  onChange={handleBirthdayChange}
                  disabled={saving}
                  className="pl-9 bg-background-tertiary border-border-primary text-content-primary placeholder:text-content-tertiary"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" variant="brand" disabled={saving}>
                {saving ? "Salvando..." : "Salvar admin"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
