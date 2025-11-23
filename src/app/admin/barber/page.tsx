// app/admin/barber/page.tsx
import { prisma } from "@/lib/prisma";
import { Metadata } from "next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
// ⬇️ Agora usamos o componente reutilizável de status
import { ServiceStatusBadge } from "@/components/service-status-badge";
import { createBarber, toggleBarberStatus, updateBarber } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Profissionais",
};

export default async function BarbersPage() {
  const barbers = await prisma.barber.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6 max-w-7xl ">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title text-content-primary">Profissionais</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Gerencie os Profissionais disponíveis para agendamento.
          </p>
        </div>

        <NewBarberDialog />
      </header>

      <section className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
        <table className="min-w-full text-sm">
          <tbody>
            {barbers.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-paragraph-small text-content-secondary"
                >
                  Nenhum barbeiro cadastrado ainda.
                </td>
              </tr>
            ) : (
              barbers.map((barber) => (
                <tr key={barber.id} className="border-t border-border-primary">
                  <td className="px-4 py-3">{barber.name}</td>
                  <td className="px-4 py-3">{barber.email}</td>
                  <td className="px-4 py-3">{barber.phone ?? "-"}</td>

                  {/* STATUS usando ServiceStatusBadge */}
                  <td className="px-4 py-3">
                    <ServiceStatusBadge isActive={barber.isActive} />
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {/* EDITAR em modal inline */}
                      <EditBarberDialog barber={barber} />

                      {/* ATIVAR / DESATIVAR */}
                      <form action={toggleBarberStatus}>
                        <input
                          type="hidden"
                          name="barberId"
                          value={barber.id}
                        />
                        <Button
                          variant={barber.isActive ? "destructive" : "active"}
                          size="sm"
                          type="submit"
                          className="border-border-primary hover:bg-muted/40"
                        >
                          {barber.isActive ? "Desativar" : "Ativar"}
                        </Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/* ========= NOVO PROFISSIONAL ========= */

function NewBarberDialog() {
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

          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="password"
            >
              Senha para o barbeiro
            </label>
            <Input
              id="password"
              type="password"
              name="password"
              required
              className="bg-background-tertiary border-border-primary text-content-primary"
              placeholder="Defina a senha de acesso do barbeiro"
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

/* ========= EDITAR PROFISSIONAL (MODAL INLINE) ========= */

type BarberForEdit = Awaited<ReturnType<typeof prisma.barber.findMany>>[number];

function EditBarberDialog({ barber }: { barber: BarberForEdit }) {
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
            // mantém o contrato atual do updateBarber: recebe um FormData com "id"
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
              defaultValue={barber.name}
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
              Deixe em branco se não quiser alterar a senha do barbeiro.
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
