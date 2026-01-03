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
import { requireAdminWithPermissions } from "@/lib/admin-permissions";

type ServiceEditDialogProps = {
  service: Service;
};

type AdminContext = {
  companyId?: string;
};

function toStringNumberOrEmpty(value: unknown): string {
  if (value === null || value === undefined) return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

export async function ServiceEditDialog({ service }: ServiceEditDialogProps) {
  // ✅ tenant context (fonte da verdade)
  const currentAdmin = (await requireAdminWithPermissions()) as AdminContext;
  const companyId = currentAdmin.companyId?.trim();

  if (!companyId) {
    throw new Error(
      "[ServiceEditDialog] ADMIN sem companyId. Este painel é multi-tenant: vincule o admin a uma empresa (companyId).",
    );
  }

  // ✅ defesa: garante que o serviço pertence ao tenant
  const serviceExistsInTenant = await prisma.service.findFirst({
    where: { id: service.id, companyId },
    select: { id: true },
  });

  if (!serviceExistsInTenant) {
    throw new Error("Serviço não encontrado para esta empresa.");
  }

  const barberPercentageDefault = toStringNumberOrEmpty(
    (service as any).barberPercentage,
  );
  const cancelLimitHoursDefault = toStringNumberOrEmpty(
    (service as any).cancelLimitHours,
  );
  const cancelFeePercentageDefault = toStringNumberOrEmpty(
    (service as any).cancelFeePercentage,
  );

  // 🔹 Carrega profissionais ativos do tenant + vínculos deste serviço (scoped)
  const [barbers, serviceProfessionals] = await Promise.all([
    prisma.barber.findMany({
      where: {
        companyId,
        isActive: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.serviceProfessional.findMany({
      where: {
        companyId,
        serviceId: service.id,
      },
      select: { barberId: true },
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

          {/* LIMITE DE CANCELAMENTO */}
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

          {/* TAXA DE CANCELAMENTO */}
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

          {/* PROFISSIONAIS */}
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
