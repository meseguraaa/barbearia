import { getServerSession } from "next-auth";
import { nextAuthOptions } from "@/lib/nextauth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Server Action para atualizar telefone + aniversário
async function updateProfile(formData: FormData) {
  "use server";

  const session = await getServerSession(nextAuthOptions);

  if (!session || (session.user as any).role !== "CLIENT") {
    redirect("/painel/login");
  }

  const phone = String(formData.get("phone") ?? "").trim();
  const birthdayRaw = String(formData.get("birthday") ?? "").trim();

  const userId = (session.user as any).id;

  // Se vier preenchido, converte para Date; se vier vazio, seta null
  const birthday =
    birthdayRaw.length > 0 ? new Date(`${birthdayRaw}T00:00:00`) : null;

  await prisma.user.update({
    where: { id: userId },
    data: {
      phone,
      birthday,
    },
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

  // Transformar Date -> "YYYY-MM-DD" pro input[type=date]
  const birthdayDefaultValue = user.birthday
    ? new Date(user.birthday).toISOString().split("T")[0]
    : "";

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

        <form action={updateProfile} className="space-y-4">
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

          <div className="space-y-2">
            <label
              htmlFor="birthday"
              className="text-label-small-size text-content-secondary"
            >
              Data de aniversário
            </label>
            <Input
              id="birthday"
              name="birthday"
              type="date"
              defaultValue={birthdayDefaultValue}
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
