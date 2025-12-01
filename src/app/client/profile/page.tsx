import { getServerSession } from "next-auth";
import { nextAuthOptions } from "@/lib/nextauth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Server Action para atualizar o telefone
async function updatePhone(formData: FormData) {
  "use server";

  const session = await getServerSession(nextAuthOptions);

  if (!session || (session.user as any).role !== "CLIENT") {
    redirect("/painel/login");
  }

  const phone = String(formData.get("phone") ?? "").trim();

  await prisma.user.update({
    where: { id: (session.user as any).id },
    data: { phone },
  });

  redirect("/client/profile");
}

export default async function ClientProfilePage() {
  const session = await getServerSession(nextAuthOptions);

  if (!session || (session.user as any).role !== "CLIENT") {
    redirect("/painel/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: (session.user as any).id },
  });

  if (!user) redirect("/painel/login");

  const name = user.name ?? "Cliente";
  const email = user.email ?? "";
  const image = user.image ?? "/default-avatar.png";
  const phone = user.phone ?? "";

  return (
    <div className="max-w-xl mx-auto py-10 px-6 space-y-8">
      <header className="flex items-center gap-4">
        <img
          src={image}
          alt={name}
          width={64}
          height={64}
          className="rounded-full border border-border-primary object-cover"
        />
        <div>
          <h1 className="text-title-size text-content-primary mb-1">
            Meu perfil
          </h1>
          <p className="text-paragraph-small-size text-content-secondary">
            {name}
          </p>
          <p className="text-paragraph-small-size text-content-tertiary">
            {email}
          </p>
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="text-label-medium-size text-content-primary">
          Dados de contato
        </h2>

        <form action={updatePhone} className="space-y-4">
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
              defaultValue={phone}
              className="bg-background-tertiary border-border-primary text-content-primary placeholder:text-content-tertiary"
            />
          </div>

          <Button type="submit" variant="brand">
            Salvar
          </Button>
        </form>
      </section>
    </div>
  );
}
