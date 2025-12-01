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

type ClientProfileDialogProps = {
  userName: string;
  userImage: string;
};

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
        setPhone(data.phone);
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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);
      await updateClientPhoneAction(phone);
      toast.success("Telefone atualizado com sucesso!");
      setOpen(false);
    } catch (error) {
      console.error("Erro ao atualizar telefone", error);
      toast.error("Erro ao salvar telefone. Tente novamente.");
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

          {/* Form de telefone */}
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="phone"
                className="text-label-small-size text-content-secondary"
              >
                Telefone
              </label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="(99) 99999-9999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loadingProfile || saving}
                className="bg-background-tertiary border-border-primary text-content-primary placeholder:text-content-tertiary"
              />
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
