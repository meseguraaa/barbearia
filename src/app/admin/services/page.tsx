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

import {
  createService,
  toggleServiceStatus,
  updateService,
  createPlan,
  togglePlanStatus,
  updatePlan,
  createClientPlanForClient,
  expireClientPlan,
  revalidateClientPlan,
} from "./actions";
import type {
  Service,
  Plan,
  PlanService as PlanServiceModel,
  ClientPlan,
  User,
} from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Serviços",
};

type PlanWithServices = Plan & {
  services: (PlanServiceModel & { service: Service })[];
};

type ClientPlanWithRelations = ClientPlan & {
  client: User;
  plan: Plan;
};

/* ========= BADGE DE STATUS DO PLANO DO CLIENTE ========= */

type ClientPlanStatus = ClientPlan["status"];

const CLIENT_PLAN_STATUS_MAP: Record<
  ClientPlanStatus,
  { label: string; className: string }
> = {
  ACTIVE: {
    label: "Ativo",
    className: "text-green-500 bg-green-100/10 border border-green-500",
  },
  EXPIRED: {
    label: "Expirado",
    className: "text-amber-500 bg-amber-100/10 border border-amber-500",
  },
  CANCELED: {
    label: "Cancelado",
    className: "text-red-500 bg-red-100/10 border border-red-500",
  },
};

type ClientPlanStatusBadgeProps = {
  status?: ClientPlanStatus | null;
};

function ClientPlanStatusBadge({ status }: ClientPlanStatusBadgeProps) {
  const key: ClientPlanStatus = status ?? "ACTIVE";
  const item = CLIENT_PLAN_STATUS_MAP[key];

  return (
    <span
      className={`
        px-3 py-1.5 text-xs font-medium rounded-full inline-block
        ${item.className}
      `}
    >
      {item.label}
    </span>
  );
}

export default async function ServicesPage() {
  const services = await prisma.service.findMany({
    orderBy: { createdAt: "desc" },
  });

  const plans = (await prisma.plan.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      services: {
        include: {
          service: true,
        },
      },
    },
  })) as PlanWithServices[];

  // 🔹 Todos os vínculos cliente <-> plano (com plano incluso)
  const clientPlans = (await prisma.clientPlan.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      client: true,
      plan: true,
    },
  })) as ClientPlanWithRelations[];

  // 🔹 Regra: cliente NÃO pode aparecer no modal se:
  // - tiver um ClientPlan com:
  //   - status === "ACTIVE"
  //   - usedBookings < totalBookings
  //   - endDate ainda não passou
  const today = new Date();

  const blockedClientIds = new Set(
    clientPlans
      .filter((cp) => {
        const hasCredits = cp.usedBookings < cp.plan.totalBookings;
        const isWithinValidity = cp.endDate >= today;
        const isActive = cp.status === "ACTIVE";

        return isActive && hasCredits && isWithinValidity;
      })
      .map((cp) => cp.clientId),
  );

  // 🔹 Clientes disponíveis para receber um novo plano
  const allClients = await prisma.user.findMany({
    where: { role: "CLIENT" },
    orderBy: { name: "asc" },
  });

  const clients = allClients.filter(
    (client) => !blockedClientIds.has(client.id),
  );

  const latestPlanByClientId = new Map<
    string,
    { planId: string; startDate: Date }
  >();

  clientPlans.forEach((plan) => {
    // usa o que você tiver disponível: clientId ou client.id
    const clientId = (plan as any).clientId ?? plan.client.id;
    const planStartDate = new Date(plan.startDate);

    const current = latestPlanByClientId.get(clientId);

    if (!current || planStartDate > current.startDate) {
      latestPlanByClientId.set(clientId, {
        planId: plan.id,
        startDate: planStartDate,
      });
    }
  });

  return (
    <div className="space-y-10 max-w-7xl">
      {/* HEADER GERAL */}
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title text-content-primary">Serviços & Planos</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Gerencie os serviços avulsos, os planos e os clientes vinculados.
          </p>
        </div>
      </header>

      {/* ========================== */}
      {/* SEÇÃO: SERVIÇOS           */}
      {/* ========================== */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-subtitle text-content-primary">Serviços</h2>
          <NewServiceDialog />
        </div>

        <div className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
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
                      <td className="px-4 py-3">
                        {service.durationMinutes} min
                      </td>

                      {/* PORCENTAGEM DO BARBEIRO */}
                      <td className="px-4 py-3">
                        {barberPercentage !== null
                          ? `${barberPercentage}%`
                          : "-"}
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
        </div>
      </section>

      {/* ========================== */}
      {/* SEÇÃO: PLANOS             */}
      {/* ========================== */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-subtitle text-content-primary">Planos</h2>
            <p className="text-paragraph-small text-content-secondary">
              Configure planos mensais com 4 agendamentos e comissão fixa para
              os barbeiros.
            </p>
          </div>

          <NewPlanDialog services={services} />
        </div>

        <div className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
          <table className="min-w-full text-sm">
            <tbody>
              {plans.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-paragraph-small text-content-secondary"
                  >
                    Nenhum plano cadastrado ainda.
                  </td>
                </tr>
              ) : (
                plans.map((plan) => {
                  const fullServicesNames = plan.services
                    .map((ps) => ps.service.name)
                    .join(", ");

                  return (
                    <tr
                      key={plan.id}
                      className="border-t border-border-primary"
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-content-primary">
                            {plan.name}
                          </span>
                          {plan.description && (
                            <span className="text-xs text-content-secondary">
                              {plan.description}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        R$ {Number(plan.price).toFixed(2)}
                      </td>

                      <td className="px-4 py-3">
                        {plan.totalBookings} agendamentos
                      </td>

                      <td className="px-4 py-3">
                        {plan.commissionPercent}% comissão
                      </td>

                      <td className="px-4 py-3 max-w-xs">
                        <span className="text-xs text-content-secondary">
                          {fullServicesNames || "—"}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <ServiceStatusBadge isActive={plan.isActive} />

                          <AssignPlanToClientDialog
                            plan={plan}
                            clients={clients}
                          />

                          <EditPlanDialog plan={plan} services={services} />

                          <form action={togglePlanStatus}>
                            <input
                              type="hidden"
                              name="planId"
                              value={plan.id}
                            />
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
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ========================== */}
      {/* SEÇÃO: CLIENTES COM PLANO */}
      {/* ========================== */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-subtitle text-content-primary">
              Clientes com plano
            </h2>
            <p className="text-paragraph-small text-content-secondary">
              Veja os clientes que possuem plano e a utilização dos
              agendamentos.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
          <table className="min-w-full text-sm">
            <tbody>
              {clientPlans.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-paragraph-small text-content-secondary"
                  >
                    Nenhum cliente possui plano ainda.
                  </td>
                </tr>
              ) : (
                clientPlans.map((clientPlan) => {
                  const endDate = new Date(clientPlan.endDate);
                  const startDate = new Date(clientPlan.startDate);

                  const endDateFormatted = endDate.toLocaleDateString("pt-BR");
                  const startDateFormatted =
                    startDate.toLocaleDateString("pt-BR");

                  const isActive = clientPlan.status === "ACTIVE";
                  const hasCredits =
                    clientPlan.usedBookings < clientPlan.plan.totalBookings;
                  const isFullyUsed =
                    clientPlan.usedBookings >= clientPlan.plan.totalBookings;

                  const canExpire = isActive && hasCredits;

                  // 🆕 descobrir se ESSE é o último plano do cliente
                  const clientId =
                    (clientPlan as any).clientId ?? clientPlan.client.id;

                  const isLastPlanForClient =
                    latestPlanByClientId.get(clientId)?.planId ===
                    clientPlan.id;

                  // 🔹 agora só pode revalidar se for totalmente usado E for o último plano do cliente
                  const canRevalidate = isFullyUsed && isLastPlanForClient;

                  return (
                    <tr
                      key={clientPlan.id}
                      className="border-t border-border-primary"
                    >
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
                          <span className="text-content-primary">
                            {clientPlan.plan.name}
                          </span>
                          <span className="text-xs text-content-secondary">
                            {clientPlan.usedBookings} /{" "}
                            {clientPlan.plan.totalBookings} agendamentos usados
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
                              <input
                                type="hidden"
                                name="clientPlanId"
                                value={clientPlan.id}
                              />
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
                            <RevalidateClientPlanDialog
                              clientPlan={clientPlan}
                              plans={plans}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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

/* ========= NOVO PLANO ========= */

function NewPlanDialog({ services }: { services: Service[] }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="brand">Novo plano</Button>
      </DialogTrigger>

      <DialogContent className="bg-background-secondary border border-border-primary max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Novo plano
          </DialogTitle>
        </DialogHeader>

        <form
          action={async (formData) => {
            "use server";
            await createPlan(formData);
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
              required
              placeholder="Ex: Plano Mensal 4 cortes"
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
              placeholder="Ex: 4 agendamentos em 30 dias"
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
              placeholder="Ex: 400"
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
              placeholder="Ex: 50"
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          {/* INFO FIXA SOBRE DURAÇÃO E QUANTIDADE */}
          <div className="space-y-1">
            <p className="text-label-small text-content-secondary">
              Este plano terá{" "}
              <span className="font-semibold">4 agendamentos</span> em até{" "}
              <span className="font-semibold">30 dias</span>.
            </p>
            <input type="hidden" name="durationDays" value="30" />
            <input type="hidden" name="totalBookings" value="4" />
          </div>

          {/* SERVIÇOS INCLUÍDOS */}
          <div className="space-y-2">
            <p className="text-label-small text-content-secondary">
              Serviços incluídos no plano
            </p>

            {services.length === 0 ? (
              <p className="text-xs text-content-secondary">
                Cadastre serviços antes de criar um plano.
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
            <Button
              type="submit"
              variant="brand"
              disabled={services.length === 0}
            >
              Criar plano
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ========= EDITAR PLANO ========= */

function EditPlanDialog({
  plan,
  services,
}: {
  plan: PlanWithServices;
  services: Service[];
}) {
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

function AssignPlanToClientDialog({
  plan,
  clients,
}: {
  plan: Plan;
  clients: User[];
}) {
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

/* ========= REVALIDAR PLANO DE CLIENTE ========= */

function RevalidateClientPlanDialog({
  clientPlan,
  plans,
}: {
  clientPlan: ClientPlanWithRelations;
  plans: PlanWithServices[];
}) {
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
