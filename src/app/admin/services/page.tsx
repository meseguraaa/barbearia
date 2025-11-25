// app/admin/services/page.tsx
import { prisma } from "@/lib/prisma";
import { Metadata } from "next";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ServiceStatusBadge } from "@/components/service-status-badge";

import { createService, toggleServiceStatus, updateService } from "./actions";
import type { Service } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Serviços",
};

export default async function ServicesPage() {
  const services = await prisma.service.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6 max-w-7xl">
      {/* HEADER */}
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title text-content-primary">Serviços</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Gerencie os serviços disponíveis para agendamento.
          </p>
        </div>

        <NewServiceDialog />
      </header>

      {/* TABELA */}
      <section className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
        <table className="min-w-full text-sm">
          <tbody>
            {services.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-6 text-center text-paragraph-small text-content-secondary"
                >
                  Nenhum serviço cadastrado ainda.
                </td>
              </tr>
            ) : (
              services.map((service) => {
                const rawBarberPercentage = (service as any)
                  .barberPercentage as number | null | undefined;

                const barberPercentage =
                  rawBarberPercentage !== undefined &&
                  rawBarberPercentage !== null
                    ? Number(rawBarberPercentage)
                    : null;

                const rawCancelLimitHours = (service as any)
                  .cancelLimitHours as number | null | undefined;
                const cancelLimitHours =
                  rawCancelLimitHours !== undefined &&
                  rawCancelLimitHours !== null
                    ? Number(rawCancelLimitHours)
                    : null;

                const rawCancelFeePercentage = (service as any)
                  .cancelFeePercentage as number | null | undefined;
                const cancelFeePercentage =
                  rawCancelFeePercentage !== undefined &&
                  rawCancelFeePercentage !== null
                    ? Number(rawCancelFeePercentage)
                    : null;

                return (
                  <tr
                    key={service.id}
                    className="border-t border-border-primary"
                  >
                    <td className="px-4 py-3">{service.name}</td>
                    <td className="px-4 py-3">
                      R$ {Number(service.price).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">{service.durationMinutes} min</td>

                    {/* PORCENTAGEM DO BARBEIRO */}
                    <td className="px-4 py-3">
                      {barberPercentage !== null ? `${barberPercentage}%` : "-"}
                    </td>

                    {/* LIMITE DE CANCELAMENTO */}
                    <td className="px-4 py-3">
                      {cancelLimitHours !== null
                        ? `Até ${cancelLimitHours}h antes`
                        : "—"}
                    </td>

                    {/* TAXA DE CANCELAMENTO */}
                    <td className="px-4 py-3">
                      {cancelFeePercentage !== null
                        ? `${cancelFeePercentage}%`
                        : "—"}
                    </td>

                    <td className="px-4 py-3">
                      <ServiceStatusBadge isActive={service.isActive} />
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {/* EDITAR → modal inline */}
                        <EditServiceDialog service={service} />

                        {/* ATIVAR / DESATIVAR */}
                        <form action={toggleServiceStatus}>
                          <input
                            type="hidden"
                            name="serviceId"
                            value={service.id}
                          />
                          <Button
                            variant={
                              service.isActive ? "destructive" : "active"
                            }
                            size="sm"
                            type="submit"
                            className="border-border-primary hover:bg-muted/40"
                          >
                            {service.isActive ? "Desativar" : "Ativar"}
                          </Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/* ========= NOVO SERVIÇO ========= */

function NewServiceDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="brand">Novo serviço</Button>
      </DialogTrigger>

      <DialogContent className="bg-background-secondary border border-border-primary">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Novo serviço
          </DialogTitle>
        </DialogHeader>

        <form
          action={async (formData) => {
            "use server";
            await createService(formData);
            // navega para a mesma página → fecha o modal
            redirect("/admin/services");
          }}
          className="space-y-4"
        >
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
              required
              className="bg-background-tertiary border-border-primary text-content-primary"
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
              className="bg-background-tertiary border-border-primary text-content-primary"
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
              className="bg-background-tertiary border-border-primary text-content-primary"
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
              placeholder="Ex: 50"
              className="bg-background-tertiary border-border-primary text-content-primary"
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
              placeholder="Ex: 2 (até 2h antes)"
              className="bg-background-tertiary border-border-primary text-content-primary"
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
              placeholder="Ex: 50"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" variant="brand">
              Criar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ========= EDITAR SERVIÇO (MODAL INLINE) ========= */

function EditServiceDialog({ service }: { service: Service }) {
  const rawBarberPercentage = (service as any).barberPercentage as
    | number
    | null
    | undefined;

  const barberPercentageDefault =
    rawBarberPercentage !== undefined && rawBarberPercentage !== null
      ? String(Number(rawBarberPercentage))
      : "";

  const rawCancelLimitHours = (service as any).cancelLimitHours as
    | number
    | null
    | undefined;

  const cancelLimitHoursDefault =
    rawCancelLimitHours !== undefined && rawCancelLimitHours !== null
      ? String(Number(rawCancelLimitHours))
      : "";

  const rawCancelFeePercentage = (service as any).cancelFeePercentage as
    | number
    | null
    | undefined;

  const cancelFeePercentageDefault =
    rawCancelFeePercentage !== undefined && rawCancelFeePercentage !== null
      ? String(Number(rawCancelFeePercentage))
      : "";

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
            Editar serviço
          </DialogTitle>
        </DialogHeader>

        <form
          action={async (formData) => {
            "use server";
            await updateService(service.id, formData);
            // redireciona pra mesma página → fecha o modal
            redirect("/admin/services");
          }}
          className="space-y-4"
        >
          {/* NOME */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Nome do serviço
            </label>
            <Input
              name="name"
              defaultValue={service.name}
              required
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* VALOR */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Valor (R$)
            </label>
            <Input
              name="price"
              type="number"
              step="0.01"
              required
              defaultValue={String(service.price)}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* DURAÇÃO */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Duração (minutos)
            </label>
            <Input
              name="durationMinutes"
              type="number"
              required
              defaultValue={service.durationMinutes}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* PORCENTAGEM DO BARBEIRO */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Porcentagem do barbeiro (%)
            </label>
            <Input
              name="barberPercentage"
              type="number"
              step="0.01"
              min={0}
              max={100}
              defaultValue={barberPercentageDefault}
              placeholder="Ex: 50"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* LIMITE DE CANCELAMENTO */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Limite para cobrança de taxa (horas antes do horário)
            </label>
            <Input
              name="cancelLimitHours"
              type="number"
              min={0}
              defaultValue={cancelLimitHoursDefault}
              placeholder="Ex: 2 (até 2h antes)"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* TAXA DE CANCELAMENTO */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Taxa de cancelamento (%)
            </label>
            <Input
              name="cancelFeePercentage"
              type="number"
              step="0.01"
              min={0}
              max={100}
              defaultValue={cancelFeePercentageDefault}
              placeholder="Ex: 50"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
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
