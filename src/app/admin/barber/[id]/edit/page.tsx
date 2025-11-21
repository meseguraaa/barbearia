import { prisma } from "@/lib/prisma";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateBarber } from "../../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Editar barbeiro | Admin",
};

type EditBarberPageProps = {
  // 👇 aqui está o segredo: params é uma Promise
  params: Promise<{
    id: string;
  }>;
};

export default async function EditBarberPage({ params }: EditBarberPageProps) {
  // precisamos fazer await em params
  const resolvedParams = await params;

  const barber = await prisma.barber.findUnique({
    where: { id: resolvedParams.id },
  });

  if (!barber) {
    notFound();
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title text-content-primary">Editar barbeiro</h1>
          <p className="text-paragraph-small text-content-secondary">
            Atualize os dados do barbeiro.
          </p>
        </div>

        <Button
          asChild
          variant="outline"
          className="border-border-primary hover:bg-muted/40"
        >
          <Link href="/admin/barber">Voltar</Link>
        </Button>
      </header>

      <section className="rounded-xl border border-border-primary bg-background-tertiary p-4">
        <form
          action={async (formData) => {
            "use server";
            await updateBarber(formData);
          }}
          className="space-y-4"
        >
          <input type="hidden" name="id" value={barber.id} />

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
              defaultValue={barber.name}
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
              defaultValue={barber.email}
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
              defaultValue={barber.phone ?? ""}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="password"
            >
              Nova senha (opcional)
            </label>
            <Input
              id="password"
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
      </section>
    </div>
  );
}
