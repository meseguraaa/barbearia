// app/admin/services/page.tsx
import { prisma } from "@/lib/prisma";
import { Metadata } from "next";

import {
  Service,
  Plan,
  PlanService as PlanServiceModel,
  ClientPlan,
  User,
} from "@prisma/client";

import { PlanNewDialog } from "@/components/plan-new-dialog";
import { ServiceNewDialog } from "@/components/service-new-dialog";
import { ServiceRow } from "@/components/service-row";
import { PlanRow } from "@/components/plan-row";
import { ClientPlanRow } from "@/components/client-plan-row";
import { requireAdminPermission } from "@/lib/admin-permissions";

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

export default async function ServicesPage() {
  // 🔐 Permissão: precisa ter acesso a Serviços (ou ser Dono)
  await requireAdminPermission("canAccessServices");

  // 🔹 Serviços em ordem alfabética pelo nome
  const services = await prisma.service.findMany({
    orderBy: { name: "asc" },
  });

  // 🔹 Planos em ordem alfabética pelo nome
  const plans = (await prisma.plan.findMany({
    orderBy: { name: "asc" },
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

  // 🔹 Descobrir último plano de cada cliente (pra regra de revalidação)
  const latestPlanByClientId = new Map<
    string,
    { planId: string; startDate: Date }
  >();

  clientPlans.forEach((plan) => {
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
          <ServiceNewDialog />
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
                services.map((service) => (
                  <ServiceRow key={service.id} service={service} />
                ))
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

          <PlanNewDialog services={services} />
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
                plans.map((plan) => (
                  <PlanRow
                    key={plan.id}
                    plan={plan}
                    services={services}
                    clients={clients}
                  />
                ))
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
                  const clientId =
                    (clientPlan as any).clientId ?? clientPlan.client.id;

                  const isActive = clientPlan.status === "ACTIVE";
                  const hasCredits =
                    clientPlan.usedBookings < clientPlan.plan.totalBookings;
                  const isFullyUsed =
                    clientPlan.usedBookings >= clientPlan.plan.totalBookings;

                  const canExpire = isActive && hasCredits;

                  const isLastPlanForClient =
                    latestPlanByClientId.get(clientId)?.planId ===
                    clientPlan.id;

                  const canRevalidate = isFullyUsed && isLastPlanForClient;

                  return (
                    <ClientPlanRow
                      key={clientPlan.id}
                      clientPlan={clientPlan}
                      plans={plans}
                      canExpire={canExpire}
                      canRevalidate={canRevalidate}
                    />
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
