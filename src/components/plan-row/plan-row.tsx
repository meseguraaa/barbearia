import type {
  Plan,
  Service,
  PlanService as PlanServiceModel,
  User,
} from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ServiceStatusBadge } from "@/components/service-status-badge";
import {
  AssignPlanToClientDialog,
  RevalidateClientPlanDialog, // usado em client-plan-row (import lá, não aqui)
} from "@/components/client-plan-row"; // apenas se você quiser reusar, mas aqui não usamos
import {
  togglePlanStatus,
  updatePlan,
  createClientPlanForClient,
} from "@/app/admin/services/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { redirect } from "next/navigation";

type PlanWithServices = Plan & {
  services: (PlanServiceModel & { service: Service })[];
};

type PlanRowProps = {
  plan: PlanWithServices;
  services: Service[];
  clients: User[];
};

export function PlanRow({ plan, services, clients }: PlanRowProps) {
  const fullServicesNames = plan.services
    .map((ps) => ps.service.name)
    .join(", ");

  return (
    <tr className="border-t border-border-primary">
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="font-medium text-content-primary">{plan.name}</span>
          {plan.description && (
            <span className="text-xs text-content-secondary">
              {plan.description}
            </span>
          )}
        </div>
      </td>

      <td className="px-4 py-3">R$ {Number(plan.price).toFixed(2)}</td>

      <td className="px-4 py-3">{plan.totalBookings} agendamentos</td>

      <td className="px-4 py-3">{plan.commissionPercent}% comissão</td>

      <td className="px-4 py-3 max-w-xs">
        <span className="text-xs text-content-secondary">
          {fullServicesNames || "—"}
        </span>
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <ServiceStatusBadge isActive={plan.isActive} />

          <PlanAssignClientDialog plan={plan} clients={clients} />

          <PlanEditDialog plan={plan} services={services} />

          <form action={togglePlanStatus}>
            <input type="hidden" name="planId" value={plan.id} />
            <Button
              variant={plan.isActive ? "destructive" : "active"}
              size="sm"
              type="submit"
              className="border-border-primary hover:bg-muted/40"
            >
              {plan.isActive ? "Desativar" : "Ativar"}
            </Button>
          </form>
        </div>
      </td>
    </tr>
  );
}

/* ========= EDITAR PLANO ========= */

type PlanEditDialogProps = {
  plan: PlanWithServices;
  services: Service[];
};

function PlanEditDialog({ plan, services }: PlanEditDialogProps) {
  const serviceIdsInPlan = new Set(plan.services.map((ps) => ps.serviceId));

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

      <DialogContent className="bg-background-secondary border border-border-primary max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Editar plano
          </DialogTitle>
        </DialogHeader>

        <form
          action={async (formData) => {
            "use server";
            await updatePlan(plan.id, formData);
            redirect("/admin/services");
          }}
          className="space-y-4"
        >
          {/* NOME */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Nome do plano
            </label>
            <Input
              name="name"
              defaultValue={plan.name}
              required
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* DESCRIÇÃO */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Descrição (opcional)
            </label>
            <Input
              name="description"
              defaultValue={plan.description ?? ""}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* PREÇO DO PLANO */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Valor do plano (R$)
            </label>
            <Input
              name="price"
              type="number"
              step="0.01"
              required
              defaultValue={String(plan.price)}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* PORCENTAGEM COMISSÃO */}
          <div className="space-y-1">
            <label className="text-label-small text-content-secondary">
              Comissão do barbeiro sobre o plano (%)
            </label>
            <Input
              name="commissionPercent"
              type="number"
              step="0.01"
              min={0}
              max={100}
              required
              defaultValue={String(plan.commissionPercent)}
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* INFO FIXA SOBRE DURAÇÃO E QUANTIDADE */}
          <div className="space-y-1">
            <p className="text-label-small text-content-secondary">
              Este plano possui{" "}
              <span className="font-semibold">
                {plan.totalBookings} agendamentos
              </span>{" "}
              em <span className="font-semibold">{plan.durationDays} dias</span>
              .
            </p>
            <input
              type="hidden"
              name="durationDays"
              value={plan.durationDays}
            />
            <input
              type="hidden"
              name="totalBookings"
              value={plan.totalBookings}
            />
          </div>

          {/* SERVIÇOS INCLUÍDOS */}
          <div className="space-y-2">
            <p className="text-label-small text-content-secondary">
              Serviços incluídos no plano
            </p>

            {services.length === 0 ? (
              <p className="text-xs text-content-secondary">
                Cadastre serviços antes de editar o plano.
              </p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border-primary bg-background-tertiary px-3 py-2">
                {services.map((service) => (
                  <label
                    key={service.id}
                    className="flex items-center justify-between gap-2 text-xs text-content-primary"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="serviceIds"
                        value={service.id}
                        defaultChecked={serviceIdsInPlan.has(service.id)}
                        className="h-3 w-3"
                      />
                      <span>{service.name}</span>
                    </div>
                    <span className="text-content-secondary">
                      R$ {Number(service.price).toFixed(2)}
                    </span>
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

/* ========= ATRIBUIR PLANO A CLIENTE ========= */

type PlanAssignClientDialogProps = {
  plan: Plan;
  clients: User[];
};

function PlanAssignClientDialog({
  plan,
  clients,
}: PlanAssignClientDialogProps) {
  const hasClients = clients.length > 0;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-border-primary hover:bg-muted/40"
          disabled={!hasClients}
        >
          Atribuir a cliente
        </Button>
      </DialogTrigger>

      <DialogContent className="bg-background-secondary border border-border-primary max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Atribuir plano a cliente
          </DialogTitle>
        </DialogHeader>

        {!hasClients ? (
          <p className="text-paragraph-small text-content-secondary">
            Não há clientes disponíveis para receber este plano. Todos os
            clientes com plano ativo e com créditos não aparecem aqui.
          </p>
        ) : (
          <form
            action={async (formData) => {
              "use server";
              await createClientPlanForClient(formData);
              redirect("/admin/services");
            }}
            className="space-y-4"
          >
            <input type="hidden" name="planId" value={plan.id} />

            <div className="space-y-1">
              <label className="text-label-small text-content-secondary">
                Cliente
              </label>
              <select
                name="clientId"
                required
                className="w-full rounded-md border border-border-primary bg-background-tertiary px-3 py-2 text-sm text-content-primary outline-none"
              >
                <option value="">Selecione um cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name || client.email}{" "}
                    {client.name && client.email ? `(${client.email})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-xs text-content-secondary">
              Ao atribuir este plano, o cliente terá{" "}
              <span className="font-semibold">{plan.totalBookings}</span>{" "}
              agendamentos em até{" "}
              <span className="font-semibold">{plan.durationDays} dias</span>.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="submit" variant="brand">
                Confirmar
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
