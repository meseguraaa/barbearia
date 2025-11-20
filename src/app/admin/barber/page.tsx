// app/admin/barber/page.tsx
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
    <main className="p-6 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Barbeiros</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os barbeiros disponíveis para agendamento.
          </p>
        </div>

        <NewBarberDialog />
      </header>

      <section className="overflow-x-auto rounded-md border">
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
                  className="px-4 py-6 text-center text-muted-foreground"
                >
                  Nenhum barbeiro cadastrado ainda.
                </td>
              </tr>
            ) : (
              barbers.map((barber) => (
                <tr key={barber.id} className="border-t">
                  <td className="px-4 py-3">{barber.name}</td>
                  <td className="px-4 py-3">{barber.email}</td>
                  <td className="px-4 py-3">{barber.phone ?? "-"}</td>
                  <td className="px-4 py-3">
                    <Badge
                      className={
                        barber.isActive
                          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                          : "bg-red-100 text-red-800 hover:bg-red-100"
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
                        <Button variant="outline" size="sm" type="submit">
                          {barber.isActive ? "Desativar" : "Ativar"}
                        </Button>
                      </form>

                      <form action={resetBarberPassword}>
                        <input
                          type="hidden"
                          name="barberId"
                          value={barber.id}
                        />
                        <Button variant="outline" size="sm" type="submit">
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
    </main>
  );
}

function NewBarberDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Novo barbeiro</Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo barbeiro</DialogTitle>
        </DialogHeader>

        <form action={createBarber} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="name">
              Nome
            </label>
            <Input id="name" name="name" required />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="email">
              E-mail
            </label>
            <Input id="email" type="email" name="email" required />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="phone">
              Telefone (opcional)
            </label>
            <Input id="phone" name="phone" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit">Salvar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
