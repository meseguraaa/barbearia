"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { updateUnit } from "@/app/admin/settings/units/actions";

type Props = {
  unit: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    isActive: boolean;
  };
};

export function UnitEditDialog({ unit }: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(unit.name ?? "");
  const [phone, setPhone] = useState(unit.phone ?? "");
  const [address, setAddress] = useState(unit.address ?? "");

  useEffect(() => {
    if (!open) return;
    // quando abre, carrega valores atuais (igual create, mas preenchido)
    setName(unit.name ?? "");
    setPhone(unit.phone ?? "");
    setAddress(unit.address ?? "");
  }, [open, unit]);

  function handleSubmit() {
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("unitId", unit.id);
        fd.set("name", name);
        fd.set("phone", phone);
        fd.set("address", address);

        await updateUnit(fd);

        toast.success("Unidade atualizada!");
        setOpen(false);
      } catch (e) {
        console.error(e);
        toast.error("Não foi possível salvar. Tente novamente.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="edit2" size="sm">
          Ajustar dados
        </Button>
      </DialogTrigger>

      <DialogContent
        variant="appointment"
        overlayVariant="blurred"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle size="modal">Editar unidade</DialogTitle>
          <DialogDescription size="modal">
            Atualize os dados da unidade. O horário é configurado abaixo no
            acordeão.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <span className="text-label-medium-size text-content-primary">
              Nome da unidade
            </span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Unidade Centro"
              className={cn("bg-background-tertiary border-border-primary")}
            />
          </div>

          <div className="space-y-2">
            <span className="text-label-medium-size text-content-primary">
              Telefone (opcional)
            </span>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
              className={cn("bg-background-tertiary border-border-primary")}
            />
          </div>

          <div className="space-y-2">
            <span className="text-label-medium-size text-content-primary">
              Endereço (opcional)
            </span>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Rua..., nº..., Bairro..."
              className={cn("bg-background-tertiary border-border-primary")}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="brand"
              onClick={handleSubmit}
              disabled={isPending}
            >
              {isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
