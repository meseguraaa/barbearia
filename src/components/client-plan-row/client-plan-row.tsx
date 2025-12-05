import type {
  ClientPlan,
  Plan,
  Service,
  PlanService as PlanServiceModel,
  User,
} from "@prisma/client";

import { Button } from "@/components/ui/button";
import { ClientPlanStatusBadge } from "@/components/client-plan-status-badge";
import {
  expireClientPlan,
  revalidateClientPlan,
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

type ClientPlanWithRelations = ClientPlan & {
  client: User;
  plan: Plan;
};

type ClientPlanRowProps = {
  clientPlan: ClientPlanWithRelations;
  plans: PlanWithServices[];
  canExpire: boolean;
  canRevalidate: boolean;
};

export function ClientPlanRow({
  clientPlan,
  plans,
  canExpire,
  canRevalidate,
}: ClientPlanRowProps) {
  const endDate = new Date(clientPlan.endDate);
  const startDate = new Date(clientPlan.startDate);

  const endDateFormatted = endDate.toLocaleDateString("pt-BR");
  const startDateFormatted = startDate.toLocaleDateString("pt-BR");

  return (
    <tr className="border-t border-border-primary">
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="font-medium text-content-primary">
            {clientPlan.client.name || "Cliente sem nome"}
          </span>
          <span className="text-xs text-content-secondary">
            {clientPlan.client.email}
          </span>
        </div>
      </td>

      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="text-content-primary">{clientPlan.plan.name}</span>
          <span className="text-xs text-content-secondary">
            {clientPlan.usedBookings} / {clientPlan.plan.totalBookings}{" "}
            agendamentos usados
          </span>
        </div>
      </td>

      <td className="px-4 py-3">
        <div className="flex flex-col text-xs text-content-secondary">
          <span>Início: {startDateFormatted}</span>
          <span>Fim: {endDateFormatted}</span>
        </div>
      </td>

      <td className="px-4 py-3">
        <ClientPlanStatusBadge status={clientPlan.status} />
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          {canExpire && (
            <form action={expireClientPlan}>
              <input type="hidden" name="clientPlanId" value={clientPlan.id} />
              <Button
                variant="destructive"
                size="sm"
                type="submit"
                className="border-border-primary hover:bg-muted/40"
              >
                Expirar plano
              </Button>
            </form>
          )}

          {canRevalidate && (
            <RevalidateClientPlanDialog clientPlan={clientPlan} plans={plans} />
          )}
        </div>
      </td>
    </tr>
  );
}

/* ========= REVALIDAR PLANO DE CLIENTE ========= */

type RevalidateClientPlanDialogProps = {
  clientPlan: ClientPlanWithRelations;
  plans: PlanWithServices[];
};

function RevalidateClientPlanDialog({
  clientPlan,
  plans,
}: RevalidateClientPlanDialogProps) {
  const activePlans = plans.filter((p) => p.isActive);
  const hasActivePlans = activePlans.length > 0;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="active"
          size="sm"
          className="border-border-primary hover:bg-muted/40"
        >
          Revalidar plano
        </Button>
      </DialogTrigger>

      <DialogContent className="bg-background-secondary border border-border-primary max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Revalidar plano
          </DialogTitle>
        </DialogHeader>

        {!hasActivePlans ? (
          <p className="text-paragraph-small text-content-secondary">
            Não há planos ativos disponíveis para revalidação. Ative ou crie um
            novo plano para continuar.
          </p>
        ) : (
          <form
            action={async (formData) => {
              "use server";
              await revalidateClientPlan(formData);
              redirect("/admin/services");
            }}
            className="space-y-4"
          >
            <input type="hidden" name="clientPlanId" value={clientPlan.id} />

            <div className="space-y-1">
              <p className="text-label-small text-content-secondary">Cliente</p>
              <p className="text-paragraph-small text-content-primary">
                {clientPlan.client.name || clientPlan.client.email}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-label-small text-content-secondary">
                Plano atual
              </p>
              <p className="text-paragraph-small text-content-primary">
                {clientPlan.plan.name} — {clientPlan.usedBookings}/
                {clientPlan.plan.totalBookings} agendamentos usados
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-label-small text-content-secondary">
                Novo plano
              </label>
              <select
                name="newPlanId"
                required
                className="w-full rounded-md border border-border-primary bg-background-tertiary px-3 py-2 text-sm text-content-primary outline-none"
              >
                <option value="">Selecione um plano</option>
                {activePlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} — {plan.totalBookings} agendamentos /{" "}
                    {plan.durationDays} dias
                  </option>
                ))}
              </select>
            </div>

            <p className="text-xs text-content-secondary">
              Ao revalidar, o plano atual será marcado como expirado e será
              criado um novo plano ativo para este cliente com novos créditos.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="submit" variant="brand">
                Confirmar revalidação
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
