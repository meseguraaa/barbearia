"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { validatePassword } from "@/lib/password-policy";

/* =========================================================
 * Tipos
 * =========================================================*/
type UnitOption = {
  id: string;
  name: string;
  isActive: boolean;
};

/* =========================================================
 * Utils
 * =========================================================*/

// 🔢 Máscara de telefone: (00) 00000-0000
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

/* =========================================================
 * Component
 * =========================================================*/
export function AdminNewAdminDialog({ units }: { units: UnitOption[] }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthdayInput, setBirthdayInput] = useState(""); // "DD/MM/AAAA"
  const [password, setPassword] = useState("");

  // ✅ unidade obrigatória
  const [unitId, setUnitId] = useState<string>("");

  const activeUnits = useMemo(
    () => (units ?? []).filter((u) => u.isActive),
    [units],
  );

  // se abrir o modal e só tiver 1 unidade ativa, já seleciona pra facilitar
  useEffect(() => {
    if (!open) return;
    if (!unitId && activeUnits.length === 1) {
      setUnitId(activeUnits[0]!.id);
    }
  }, [open, unitId, activeUnits]);

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPhone(formatPhoneDisplay(e.target.value));
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

  function resetForm() {
    setName("");
    setEmail("");
    setPhone("");
    setBirthdayInput("");
    setPassword("");
    setUnitId("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);

      if (!name.trim()) return toast.error("Preencha o nome do administrador.");

      if (!email.trim()) return toast.error("Preencha o e-mail.");
      if (!isValidEmail(email.trim()))
        return toast.error("Preencha um e-mail válido.");

      if (!phone.trim()) return toast.error("Preencha o telefone.");

      if (!birthdayInput.trim())
        return toast.error("Preencha a data de nascimento.");
      if (!isValidBirthdayDisplay(birthdayInput.trim()))
        return toast.error("Preencha a data no formato DD/MM/AAAA.");

      if (!password.trim()) return toast.error("Preencha a senha.");

      // ✅ validação forte (mesma do backend)
      const passCheck = validatePassword(password.trim());
      if (!passCheck.ok) {
        return toast.error(passCheck.errors[0] ?? "Senha inválida.");
      }

      // 🚨 OBRIGATÓRIO
      if (!unitId) {
        toast.error("Selecione a unidade do administrador.");
        return;
      }

      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("email", email.trim());
      formData.append("phone", phone.trim());
      formData.append("birthday", birthdayInput.trim());
      formData.append("password", password.trim());
      formData.append("unitId", unitId); // ✅ obrigatório no server

      const result = await createAdminAction(formData);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success("Administrador criado com sucesso!");
      setOpen(false);
      resetForm();
    } catch (err) {
      console.error("[AdminNewAdminDialog] erro:", err);
      toast.error("Erro ao salvar administrador.");
    } finally {
      setSaving(false);
    }
  }

  const descriptionText =
    "Cadastre um novo administrador para o painel e vincule a uma unidade (obrigatório).";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
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

        <form onSubmit={handleSave} className="space-y-4">
          {/* 🧍 Nome */}
          <div className="space-y-2">
            <label className="text-label-small-size text-content-primary flex items-center gap-1">
              Nome completo <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="Nome do administrador"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              className="bg-background-tertiary border-border-primary text-content-primary placeholder:text-content-tertiary"
            />
          </div>

          {/* 📧 Email */}
          <div className="space-y-2">
            <label className="text-label-small-size text-content-primary flex items-center gap-1">
              E-mail <span className="text-red-500">*</span>
            </label>
            <Input
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
            <label className="text-label-small-size text-content-primary flex items-center gap-1">
              Senha de acesso <span className="text-red-500">*</span>
            </label>
            <Input
              type="password"
              placeholder="Defina uma senha para o admin"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={saving}
              className="bg-background-tertiary border-border-primary text-content-primary placeholder:text-content-tertiary"
            />
            <p className="text-[11px] text-content-tertiary">
              Mín. 6 caracteres, 1 maiúscula, 1 número e 1 especial
              (!@#$%^&*()_+-=[]{};':&quot;,.&lt;&gt;/?\|)
            </p>
          </div>

          {/* 📞 Telefone */}
          <div className="space-y-2">
            <label className="text-label-small-size text-content-primary flex items-center gap-1">
              Telefone <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="(00) 00000-0000"
              value={phone}
              onChange={handlePhoneChange}
              disabled={saving}
              className="bg-background-tertiary border-border-primary text-content-primary placeholder:text-content-tertiary"
            />
          </div>

          {/* 🎂 Nascimento */}
          <div className="space-y-2">
            <label className="text-label-small-size text-content-primary flex items-center gap-1">
              Data de nascimento <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <CalendarIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-border-primary" />
              <Input
                className="pl-9 bg-background-tertiary border-border-primary text-content-primary placeholder:text-content-tertiary"
                placeholder="DD/MM/AAAA"
                value={birthdayInput}
                onChange={handleBirthdayChange}
                disabled={saving}
                inputMode="numeric"
              />
            </div>
          </div>

          {/* 🏢 Unidade (obrigatória) */}
          <div className="space-y-2">
            <label className="text-label-small-size text-content-primary flex items-center gap-1">
              Unidade <span className="text-red-500">*</span>
            </label>

            <Select value={unitId} onValueChange={setUnitId} disabled={saving}>
              <SelectTrigger className="bg-background-tertiary border-border-primary text-content-primary">
                <SelectValue
                  placeholder={
                    activeUnits.length === 0
                      ? "Nenhuma unidade ativa"
                      : "Selecione a unidade"
                  }
                />
              </SelectTrigger>

              <SelectContent>
                {activeUnits.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unit.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {activeUnits.length === 0 ? (
              <p className="text-[11px] text-content-tertiary">
                Você precisa ter pelo menos 1 unidade ativa para criar admin.
              </p>
            ) : null}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              variant="brand"
              disabled={saving || activeUnits.length === 0}
            >
              {saving ? "Salvando..." : "Salvar admin"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
