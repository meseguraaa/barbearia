"use client";

import { useEffect, useState } from "react";
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
import {
  getClientProfileAction,
  updateClientPhoneAction,
} from "@/app/client/profile/actions";
import { toast } from "sonner";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";

type ClientProfileDialogProps = {
  userName: string;
  userImage: string;
};

function formatIsoToDisplay(iso: string | undefined | null): string {
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return "";
  return `${day}/${month}/${year}`;
}

function formatDisplayToIso(display: string): string {
  const cleaned = display.replace(/\s/g, "");
  const [day, month, year] = cleaned.split("/");
  if (!day || !month || !year) return "";
  if (year.length !== 4) return "";
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function isValidBirthdayDisplay(display: string): boolean {
  return /^\d{2}\/\d{2}\/\d{4}$/.test(display);
}

// 🔢 Máscara de telefone: (00) 00000-0000
function formatPhoneDisplay(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11); // 2 + 5 + 4 = 11 dígitos

  if (digits.length === 0) return "";

  if (digits.length <= 2) {
    // "(" + D ou "(" + DD
    return `(${digits}`;
  }

  if (digits.length <= 7) {
    // (00) 0 / (00) 00 / ... / (00) 00000
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  // (00) 00000-0000
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function ClientProfileDialog({
  userName,
  userImage,
}: ClientProfileDialogProps) {
  const [open, setOpen] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(userName);
  const [email, setEmail] = useState("");
  const [image, setImage] = useState(userImage);
  const [phone, setPhone] = useState("");
  const [birthdayInput, setBirthdayInput] = useState(""); // "DD/MM/AAAA"

  // Carrega os dados completos do perfil quando o modal abre pela primeira vez
  useEffect(() => {
    if (!open) return;
    // já carregado antes? evita chamadas desnecessárias se email já veio
    if (email) return;

    let cancelled = false;

    (async () => {
      try {
        setLoadingProfile(true);
        const data = await getClientProfileAction();
        if (cancelled) return;

        setName(data.name);
        setEmail(data.email);
        setImage(data.image);
        // telefone já vem formatado com máscara (se houver)
        setPhone(formatPhoneDisplay(data.phone ?? ""));
        // data.birthday vem em "YYYY-MM-DD"
        setBirthdayInput(formatIsoToDisplay(data.birthday));
      } catch (error) {
        console.error("Erro ao carregar perfil do cliente", error);
        if (!cancelled) {
          toast.error("Não foi possível carregar seu perfil.");
        }
      } finally {
        if (!cancelled) {
          setLoadingProfile(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, email]);

  function handleBirthdayChange(e: React.ChangeEvent<HTMLInputElement>) {
    let value = e.target.value;

    // Mantém só números
    value = value.replace(/\D/g, "");

    // Limita a 8 dígitos (ddmmyyyy)
    if (value.length > 8) value = value.slice(0, 8);

    // Aplica máscara DD/MM/AAAA
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

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatPhoneDisplay(e.target.value);
    setPhone(formatted);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);

      // se você quiser que sejam de fato obrigatórios:
      if (!phone.trim()) {
        toast.error("Preencha o campo de telefone.");
        setSaving(false);
        return;
      }

      if (!birthdayInput.trim()) {
        toast.error("Preencha a data de aniversário.");
        setSaving(false);
        return;
      }

      if (!isValidBirthdayDisplay(birthdayInput)) {
        toast.error("Preencha a data de aniversário no formato DD/MM/AAAA.");
        setSaving(false);
        return;
      }

      const isoBirthday = birthdayInput
        ? formatDisplayToIso(birthdayInput)
        : "";

      await updateClientPhoneAction({
        phone,
        birthday: isoBirthday || null,
      });

      toast.success("Dados atualizados com sucesso!");
      setOpen(false);
    } catch (error) {
      console.error("Erro ao atualizar perfil", error);
      toast.error("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Trigger: fica no header da schedule */}
      <DialogTrigger asChild>
        <button type="button" className="flex items-center gap-3 group">
          <span className="text-paragraph-small-size text-content-secondary group-hover:text-content-primary transition">
            Meu perfil
          </span>
          <img
            src={image}
            alt={name}
            width={64}
            height={64}
            className="rounded-full border border-border-primary object-cover"
          />
        </button>
      </DialogTrigger>

      <DialogContent
        variant="appointment"
        overlayVariant="blurred"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle size="modal">Meu perfil</DialogTitle>
          <DialogDescription size="modal">
            Veja e atualize seus dados de contato.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Foto + nome + email */}
          <div className="flex items-center gap-4">
            <img
              src={image}
              alt={name}
              width={64}
              height={64}
              className="rounded-full border border-border-primary object-cover"
            />
            <div className="space-y-1">
              <p className="text-title-size text-content-primary">{name}</p>
              {email && (
                <p className="text-paragraph-small-size text-content-secondary">
                  {email}
                </p>
              )}
            </div>
          </div>

          {/* Form de telefone + aniversário */}
          <form onSubmit={handleSave} className="space-y-4">
            {/* 📞 Telefone */}
            <div className="space-y-2">
              <label
                htmlFor="phone"
                className="text-label-small-size text-content-primary flex items-center gap-1"
              >
                Telefone
                <span className="text-red-500">*</span>
              </label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="(00) 00000-0000"
                value={phone}
                onChange={handlePhoneChange}
                disabled={loadingProfile || saving}
                className="bg-background-tertiary border-border-primary text-content-primary placeholder:text-content-tertiary"
              />
            </div>

            {/* 🎂 Data de aniversário com estilização semelhante ao date-picker */}
            <div className="space-y-2">
              <label
                htmlFor="birthday"
                className="text-label-small-size text-content-primary flex items-center gap-1"
              >
                Data de aniversário
                <span className="text-red-500">*</span>
              </label>

              <div className="flex items-center gap-2 rounded-lg border border-border-primary bg-background-tertiary px-3 py-2 focus-within:ring-2 focus-within:ring-brand-primary">
                <CalendarIcon className="w-4 h-4 text-brand-primary" />
                <input
                  id="birthday"
                  name="birthday"
                  type="text"
                  inputMode="numeric"
                  placeholder="DD/MM/AAAA"
                  value={birthdayInput}
                  onChange={handleBirthdayChange}
                  disabled={loadingProfile || saving}
                  className="flex-1 bg-transparent outline-none border-0 text-paragraph-small-size text-content-primary placeholder:text-content-tertiary"
                />
                <ChevronDown className="w-4 h-4 text-content-tertiary" />
              </div>

              <p className="text-[11px] text-content-tertiary">
                Digite no formato DD/MM/AAAA.
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="brand"
                disabled={saving || loadingProfile}
              >
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
