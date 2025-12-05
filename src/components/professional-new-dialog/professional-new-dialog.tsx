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

        <form
          action={async (formData) => {
            "use server";
            await createBarber(formData);
            // createBarber já faz redirect("/admin/barber") e revalidate
          }}
          className="space-y-4"
        >
          {/* NOME */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="name"
            >
              Nome
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
              E-mail
            </label>
            <Input
              id="email"
              type="email"
              name="email"
              required
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* TELEFONE */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="phone"
            >
              Telefone (opcional)
            </label>
            <Input
              id="phone"
              name="phone"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* SENHA */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="password"
            >
              Senha para o profissional
            </label>
            <Input
              id="password"
              type="password"
              name="password"
              required
              className="bg-background-tertiary border-border-primary text-content-primary"
              placeholder="Defina a senha de acesso do profissional"
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
