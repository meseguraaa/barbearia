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
import { Calendar as CalendarIcon } from "lucide-react";

type ClientProfileDialogProps = {
  userName: string;
  userImage: string;
  // abre o modal automaticamente (primeiro acesso / perfil incompleto)
  defaultOpen?: boolean;
  // controla a mensagem exibida para o cliente
  isFirstTime?: boolean;
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
    return `(${digits}`;
  }

  if (digits.length <= 7) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function ClientProfileDialog({
  userName,
  userImage,
  defaultOpen,
  isFirstTime,
}: ClientProfileDialogProps) {
  // se vier defaultOpen=true (perfil incompleto), já inicia aberto
  const [open, setOpen] = useState<boolean>(defaultOpen ?? false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(userName);
  const [email, setEmail] = useState("");
  const [image, setImage] = useState(userImage);
  const [phone, setPhone] = useState("");
  const [birthdayInput, setBirthdayInput] = useState(""); // "DD/MM/AAAA"

  const descriptionText = isFirstTime
    ? "Obrigado por se cadastrar, agora complete seu cadastro."
    : "Veja e atualize seus dados de contato.";

  // Carrega os dados completos do perfil quando o modal abre pela primeira vez
  useEffect(() => {
    if (!open) return;
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
        setPhone(formatPhoneDisplay(data.phone ?? ""));
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

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatPhoneDisplay(e.target.value);
    setPhone(formatted);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);

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
          <DialogDescription size="modal">{descriptionText}</DialogDescription>
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

            {/* 🎂 Data de aniversário com o MESMO estilo do telefone */}
            <div className="space-y-2">
              <label
                htmlFor="birthday"
                className="text-label-small-size text-content-primary flex items-center gap-1"
              >
                Data de aniversário
                <span className="text-red-500">*</span>
              </label>

              <div className="relative">
                <CalendarIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-border-primary" />
                <Input
                  id="birthday"
                  name="birthday"
                  type="text"
                  inputMode="numeric"
                  placeholder="DD/MM/AAAA"
                  value={birthdayInput}
                  onChange={handleBirthdayChange}
                  disabled={loadingProfile || saving}
                  // mesmo estilo base do telefone + padding pra não ficar em cima do ícone
                  className="pl-9 bg-background-tertiary border-border-primary text-content-primary placeholder:text-content-tertiary"
                />
              </div>
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
