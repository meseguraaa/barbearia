import { prisma } from "@/lib/prisma";
import { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateService } from "../../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Editar serviço",
};

type EditServicePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditServicePage({
  params,
}: EditServicePageProps) {
  // 👇 Agora tratamos params como Promise
  const { id } = await params;

  const service = await prisma.service.findUnique({
    where: { id },
  });

  if (!service) {
    notFound();
  }

  // tentativa segura de pegar a porcentagem (caso já exista no modelo)
  const barberPercentageDefault =
    (service as any).barberPercentage !== undefined &&
    (service as any).barberPercentage !== null
      ? String((service as any).barberPercentage)
      : "";

  const cancelLimitHoursDefault =
    (service as any).cancelLimitHours !== undefined &&
    (service as any).cancelLimitHours !== null
      ? String((service as any).cancelLimitHours)
      : "";

  const cancelFeePercentageDefault =
    (service as any).cancelFeePercentage !== undefined &&
    (service as any).cancelFeePercentage !== null
      ? String((service as any).cancelFeePercentage)
      : "";

  // server action local para o submit
  async function handleSubmit(formData: FormData) {
    "use server";

    await updateService(id, formData);
    redirect("/admin/services");
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* HEADER */}
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title text-content-primary">Editar serviço</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Atualize as informações do serviço selecionado.
          </p>
        </div>

        <Button asChild variant="outline">
          <Link href="/admin/services">Voltar</Link>
        </Button>
      </header>

      {/* FORM */}
      <section className="rounded-xl border border-border-primary bg-background-tertiary p-6">
        <form className="space-y-4" action={handleSubmit}>
          {/* NOME */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="name"
            >
              Nome do serviço
            </label>
            <Input
              id="name"
              name="name"
              defaultValue={service.name}
              required
              className="bg-background-secondary border-border-primary text-content-primary"
            />
          </div>

          {/* VALOR */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="price"
            >
              Valor (R$)
            </label>
            <Input
              id="price"
              name="price"
              type="number"
              step="0.01"
              required
              defaultValue={String(service.price)}
              className="bg-background-secondary border-border-primary text-content-primary"
            />
          </div>

          {/* DURAÇÃO */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="durationMinutes"
            >
              Duração (minutos)
            </label>
            <Input
              id="durationMinutes"
              name="durationMinutes"
              type="number"
              required
              defaultValue={service.durationMinutes}
              className="bg-background-secondary border-border-primary text-content-primary"
            />
          </div>

          {/* PORCENTAGEM DO BARBEIRO */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="barberPercentage"
            >
              Porcentagem do barbeiro (%)
            </label>
            <Input
              id="barberPercentage"
              name="barberPercentage"
              type="number"
              step="0.01"
              min={0}
              max={100}
              defaultValue={barberPercentageDefault}
              className="bg-background-secondary border-border-primary text-content-primary"
              placeholder="Ex: 50"
            />
          </div>

          {/* LIMITE DE CANCELAMENTO */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="cancelLimitHours"
            >
              Limite para cobrança de taxa (horas antes do horário)
            </label>
            <Input
              id="cancelLimitHours"
              name="cancelLimitHours"
              type="number"
              min={0}
              defaultValue={cancelLimitHoursDefault}
              className="bg-background-secondary border-border-primary text-content-primary"
              placeholder="Ex: 2 (até 2h antes)"
            />
          </div>

          {/* TAXA DE CANCELAMENTO */}
          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="cancelFeePercentage"
            >
              Taxa de cancelamento (%)
            </label>
            <Input
              id="cancelFeePercentage"
              name="cancelFeePercentage"
              type="number"
              step="0.01"
              min={0}
              max={100}
              defaultValue={cancelFeePercentageDefault}
              className="bg-background-secondary border-border-primary text-content-primary"
              placeholder="Ex: 50"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button asChild variant="destructive">
              <Link href="/admin/services">Cancelar</Link>
            </Button>
            <Button type="submit" variant="brand">
              Salvar alterações
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
