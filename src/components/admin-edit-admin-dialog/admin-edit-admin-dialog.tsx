// components/admin-edit-admin-dialog/index.tsx
"use client";

import { useState, useEffect } from "react";
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
import { Calendar as CalendarIcon, PenSquare } from "lucide-react";
import { updateAdminAction } from "@/app/admin/settings/actions";
import { toast } from "sonner";
import { format } from "date-fns";

type AdminForEdit = {
  id: string;
  name: string;
  email: string;
  phone: string;
  birthday: Date | null;
};

function formatPhoneDisplay(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function isValidBirthdayDisplay(display: string): boolean {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(display);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function AdminEditAdminDialog({ admin }: { admin: AdminForEdit }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(admin.name);
  const [email, setEmail] = useState(admin.email);
  const [phone, setPhone] = useState(admin.phone === "—" ? "" : admin.phone);
  const [birthdayInput, setBirthdayInput] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (admin.birthday) {
      setBirthdayInput(format(admin.birthday, "dd/MM/yyyy"));
    } else {
      setBirthdayInput("");
    }
  }, [admin.birthday]);

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
        setSaving(false);
        return;
      }

      if (!email.trim()) {
        toast.error("Preencha o e-mail.");
        setSaving(false);
        return;
      }

      if (!isValidEmail(email.trim())) {
        toast.error("Preencha um e-mail válido.");
        setSaving(false);
        return;
      }

      if (!phone.trim()) {
        toast.error("Preencha o telefone.");
        setSaving(false);
        return;
      }

      if (!birthdayInput.trim()) {
        toast.error("Preencha a data de nascimento.");
        setSaving(false);
        return;
      }

      if (!isValidBirthdayDisplay(birthdayInput)) {
        toast.error("Preencha a data de nascimento no formato DD/MM/AAAA.");
        setSaving(false);
        return;
      }

      if (password.trim() && password.trim().length < 6) {
        toast.error("A nova senha deve ter pelo menos 6 caracteres.");
        setSaving(false);
        return;
      }

      const formData = new FormData();
      formData.append("id", admin.id);
      formData.append("name", name.trim());
      formData.append("email", email.trim());
      formData.append("phone", phone.trim());
      formData.append("birthday", birthdayInput.trim());
      if (password.trim()) {
        formData.append("password", password.trim());
      }

      const result = await updateAdminAction(formData);

      if (result.error) {
        toast.error(result.error);
        setSaving(false);
        return;
      }

      toast.success("Administrador atualizado com sucesso!");
      setOpen(false);
    } catch (error) {
      console.error("Erro ao atualizar admin", error);
      toast.error("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  const descriptionText =
    "Atualize os dados de contato e, se necessário, redefina a senha desse administrador.";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="edit2">
          Editar
        </Button>
      </DialogTrigger>

      <DialogContent
        variant="appointment"
        overlayVariant="blurred"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle size="modal">Editar administrador</DialogTitle>
          <DialogDescription size="modal">{descriptionText}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <form onSubmit={handleSave} className="space-y-4">
            {/* Nome */}
            <div className="space-y-2">
              <label
                htmlFor="edit-admin-name"
                className="text-label-small-size text-content-primary flex items-center gap-1"
              >
                Nome completo
                <span className="text-red-500">*</span>
              </label>
              <Input
                id="edit-admin-name"
                name="name"
                type="text"
                placeholder="Nome do administrador"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
                className="bg-background-tertiary border-border-primary text-content-primary placeholder:text-content-tertiary"
              />
            </div>

            {/* E-mail */}
            <div className="space-y-2">
              <label
                htmlFor="edit-admin-email"
                className="text-label-small-size text-content-primary flex items-center gap-1"
              >
                E-mail
                <span className="text-red-500">*</span>
              </label>
              <Input
                id="edit-admin-email"
                name="email"
                type="email"
                placeholder="email@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={saving}
                className="bg-background-tertiary border-border-primary text-content-primary placeholder:text-content-tertiary"
              />
            </div>

            {/* Nova senha (opcional) */}
            <div className="space-y-2">
              <label
                htmlFor="edit-admin-password"
                className="text-label-small-size text-content-primary flex items-center gap-1"
              >
                Nova senha (opcional)
              </label>
              <Input
                id="edit-admin-password"
                name="password"
                type="password"
                placeholder="Preencha para alterar a senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={saving}
                className="bg-background-tertiary border-border-primary text-content-primary placeholder:text-content-tertiary"
              />
              <p className="text-[11px] text-content-tertiary">
                Se não preencher, a senha atual será mantida.
              </p>
            </div>

            {/* Telefone */}
            <div className="space-y-2">
              <label
                htmlFor="edit-admin-phone"
                className="text-label-small-size text-content-primary flex items-center gap-1"
              >
                Telefone
                <span className="text-red-500">*</span>
              </label>
              <Input
                id="edit-admin-phone"
                name="phone"
                type="tel"
                placeholder="(00) 00000-0000"
                value={phone}
                onChange={handlePhoneChange}
                disabled={saving}
                className="bg-background-tertiary border-border-primary text-content-primary placeholder:text-content-tertiary"
              />
            </div>

            {/* Nascimento */}
            <div className="space-y-2">
              <label
                htmlFor="edit-admin-birthday"
                className="text-label-small-size text-content-primary flex items-center gap-1"
              >
                Data de nascimento
                <span className="text-red-500">*</span>
              </label>

              <div className="relative">
                <CalendarIcon className="pointer-events-none absolute.left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-border-primary" />
                <Input
                  id="edit-admin-birthday"
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
                {saving ? "Salvando..." : "Salvar alterações"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
