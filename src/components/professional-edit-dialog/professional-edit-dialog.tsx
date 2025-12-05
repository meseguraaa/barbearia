import type { Barber } from "@prisma/client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateBarber } from "@/app/admin/professional/actions";

type ProfessionalEditDialogProps = {
  barber: Barber;
};

export function ProfessionalEditDialog({
  barber,
}: ProfessionalEditDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="edit2"
          size="sm"
          className="border-border-primary hover:bg-muted/40"
        >
          Editar
        </Button>
      </DialogTrigger>

      <DialogContent className="bg-background-secondary border border-border-primary">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Editar profissional
          </DialogTitle>
        </DialogHeader>

        <form
          action={async (formData) => {
            "use server";
            formData.set("id", barber.id);
            await updateBarber(formData);
            // updateBarber já faz redirect("/admin/barber") + revalidate
          }}
          className="space-y-4"
        >
          {/* NOME */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Nome
            </label>
            <Input
              name="name"
              required
              defaultValue={barber.name ?? ""}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* E-MAIL */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              E-mail
            </label>
            <Input
              type="email"
              name="email"
              required
              defaultValue={barber.email}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* TELEFONE */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Telefone (opcional)
            </label>
            <Input
              name="phone"
              defaultValue={barber.phone ?? ""}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* NOVA SENHA */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Nova senha (opcional)
            </label>
            <Input
              type="password"
              name="password"
              placeholder="Preencha para alterar a senha"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
            <p className="text-xs text-content-secondary/70">
              Deixe em branco se não quiser alterar a senha do profissional.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" variant="brand">
              Salvar alterações
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
