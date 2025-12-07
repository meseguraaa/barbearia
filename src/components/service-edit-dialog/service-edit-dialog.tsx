import type { Service } from "@prisma/client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { redirect } from "next/navigation";
import { updateService } from "@/app/admin/services/actions";
import { prisma } from "@/lib/prisma";

type ServiceEditDialogProps = {
  service: Service;
};

export async function ServiceEditDialog({ service }: ServiceEditDialogProps) {
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

  // 🔹 Carrega todos os profissionais ativos + quais estão vinculados a este serviço
  const [barbers, serviceProfessionals] = await Promise.all([
    prisma.barber.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        name: "asc",
      },
    }),
    prisma.serviceProfessional.findMany({
      where: {
        serviceId: service.id,
      },
      select: {
        barberId: true,
      },
    }),
  ]);

  const selectedBarberIds = new Set(
    serviceProfessionals.map((sp) => sp.barberId),
  );

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
            redirect("/admin/services");
          }}
          className="space-y-4"
        >
          {/* NOME */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Nome do serviço <span className="text-red-500">*</span>
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
              Valor (R$) <span className="text-red-500">*</span>
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
              Duração (minutos) <span className="text-red-500">*</span>
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
              Porcentagem do barbeiro (%){" "}
              <span className="text-red-500">*</span>
            </label>
            <Input
              name="barberPercentage"
              type="number"
              step="0.01"
              min={0}
              max={100}
              required
              defaultValue={barberPercentageDefault}
              placeholder="Ex: 50"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* LIMITE DE CANCELAMENTO — AGORA OBRIGATÓRIO */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Limite para cobrança de taxa (horas antes do horário){" "}
              <span className="text-red-500">*</span>
            </label>
            <Input
              name="cancelLimitHours"
              type="number"
              min={0}
              required
              defaultValue={cancelLimitHoursDefault}
              placeholder="Ex: 2 (até 2h antes)"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* TAXA DE CANCELAMENTO — AGORA OBRIGATÓRIO */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Taxa de cancelamento (%) <span className="text-red-500">*</span>
            </label>
            <Input
              name="cancelFeePercentage"
              type="number"
              step="0.01"
              min={0}
              max={100}
              required
              defaultValue={cancelFeePercentageDefault}
              placeholder="Ex: 50"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* PROFISSIONAIS QUE REALIZAM O SERVIÇO */}
          <div className="space-y-2">
            <p className="text-label-small text-content-secondary">
              Profissionais que realizam este serviço{" "}
              <span className="text-red-500">*</span>
            </p>

            {barbers.length === 0 ? (
              <p className="text-paragraph-small text-content-secondary">
                Nenhum profissional ativo cadastrado no momento.
              </p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border-primary bg-background-tertiary p-2">
                {barbers.map((barber) => (
                  <label
                    key={barber.id}
                    className="flex items-center gap-2 text-paragraph-small text-content-primary"
                  >
                    <input
                      type="checkbox"
                      name="professionalIds"
                      value={barber.id}
                      defaultChecked={selectedBarberIds.has(barber.id)}
                      className="h-4 w-4 rounded border-border-primary"
                    />
                    <span>{barber.name}</span>
                  </label>
                ))}
              </div>
            )}
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
