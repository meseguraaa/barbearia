import { prisma } from "@/lib/prisma";
import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createBarber, toggleBarberStatus } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Barbeiros",
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
          <p className="text-paragraph-medium-size text-content-secondary">
            Gerencie os barbeiros disponíveis para agendamento.
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
                  <td className="px-4 py-3">
                    <span
                      className={`px-3 py-1.5 text-xs font-medium rounded-full inline-block border ${
                        barber.isActive
                          ? "text-green-700 bg-green-100 border-green-300"
                          : "text-red-700 bg-red-100 border-red-300"
                      }`}
                    >
                      {barber.isActive ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {/* Botão EDITAR */}
                      <Button
                        asChild
                        variant="edit2"
                        size="sm"
                        className="border-border-primary hover:bg-muted/40"
                      >
                        <Link href={`/admin/barber/${barber.id}/edit`}>
                          Editar
                        </Link>
                      </Button>

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
