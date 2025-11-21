import { prisma } from "@/lib/prisma";
import { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  createBarber,
  toggleBarberStatus,
  resetBarberPassword,
} from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Barbeiros | Admin",
};

export default async function BarbersPage() {
  const barbers = await prisma.barber.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6 max-w-7xl ">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title text-content-primary">Barbeiros</h1>
          <p className="text-paragraph-small text-content-secondary">
            Gerencie os barbeiros disponíveis para agendamento.
          </p>
        </div>

        <NewBarberDialog />
      </header>

      <section className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">E-mail</th>
              <th className="px-4 py-3 font-medium">Telefone</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Ações</th>
            </tr>
          </thead>
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
                  <td className="px-4 py-3">
                    <Badge
                      className={
                        barber.isActive
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                          : "bg-red-500/15 text-red-300 border-red-500/40"
                      }
                    >
                      {barber.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
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
                          {barber.isActive ? "DESATIVAR" : "ATIVAR"}
                        </Button>
                      </form>

                      <form action={resetBarberPassword}>
                        <input
                          type="hidden"
                          name="barberId"
                          value={barber.id}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          type="submit"
                          className="border-border-primary hover:bg-muted/40"
                        >
                          Resetar senha
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

function NewBarberDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="brand">Novo barbeiro</Button>
      </DialogTrigger>

      <DialogContent className="bg-background-secondary border border-border-primary">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Novo barbeiro
          </DialogTitle>
        </DialogHeader>

        <form
          action={async (formData) => {
            "use server";
            await createBarber(formData);
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
