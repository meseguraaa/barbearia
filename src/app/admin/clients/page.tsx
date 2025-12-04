// app/admin/clients/page.tsx
import { Metadata } from "next";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Clientes",
};

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function buildFrequencyLabel(doneDates: Date[]): string {
  if (doneDates.length === 0) return "Sem histórico";
  if (doneDates.length === 1) return "Poucas visitas";

  const sorted = [...doneDates].sort((a, b) => a.getTime() - b.getTime());

  const diffs: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const diffMs = sorted[i].getTime() - sorted[i - 1].getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    diffs.push(diffDays);
  }

  if (diffs.length === 0) return "Poucas visitas";

  const avgDays = diffs.reduce((acc, d) => acc + d, 0) / diffs.length;

  if (avgDays <= 10) return "Muito frequente";
  if (avgDays <= 25) return `A cada ~${Math.round(avgDays)} dias`;
  return "Visita esporádica";
}

export default async function ClientsPage() {
  // 🔹 Todos os clientes
  const users = await prisma.user.findMany({
    where: { role: "CLIENT" },
    orderBy: { name: "asc" },
  });

  if (users.length === 0) {
    return (
      <div className="max-w-7xl space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-title text-content-primary">Clientes</h1>
            <p className="text-paragraph-medium-size text-content-secondary">
              Nenhum cliente cadastrado ainda.
            </p>
          </div>
        </header>
      </div>
    );
  }

  const clientIds = users.map((u) => u.id);
  const clientPhones = users
    .map((u) => (u as any).phone as string | null | undefined)
    .filter((p): p is string => !!p);

  // 🔹 Serviços
  const services = await prisma.service.findMany();
  const servicePriceById = new Map<string, number>(
    services.map((s) => [s.id, Number(s.price)]),
  );

  // 🔹 Agendamentos dos clientes (via telefone)
  const appointments = await prisma.appointment.findMany({
    where: {
      phone: { in: clientPhones },
    },
    orderBy: { scheduleAt: "asc" },
  });

  // 🔹 Planos dos clientes
  const clientPlans = await prisma.clientPlan.findMany({
    where: { clientId: { in: clientIds } },
    include: { plan: true },
    orderBy: { startDate: "asc" },
  });

  const today = new Date();

  const rows = users.map((user) => {
    const userPhone = (user as any).phone as string | null | undefined;

    const userAppointments = userPhone
      ? appointments.filter((apt) => apt.phone === userPhone)
      : [];

    const totalAppointments = userAppointments.length;

    const doneAppointments = userAppointments.filter(
      (apt) => apt.status === "DONE",
    );
    const canceledAppointments = userAppointments.filter(
      (apt) => apt.status === "CANCELED",
    );

    // 🔹 Cancelamentos com taxa
    const canceledWithFee = canceledAppointments.filter(
      (apt) => apt.cancelFeeApplied,
    );
    const canceledWithFeeCount = canceledWithFee.length;
    const totalCancelFee = canceledWithFee.reduce((sum, apt) => {
      const fee = apt.cancelFeeValue ? Number(apt.cancelFeeValue) : 0;
      return sum + fee;
    }, 0);

    // 🔹 Total de planos
    const userClientPlans = clientPlans.filter((cp) => cp.clientId === user.id);
    const totalPlans = userClientPlans.length;

    // 🔹 Plano ativo (não remove essa parte!)
    const activePlan = userClientPlans.find((cp) => {
      const hasCredits = cp.usedBookings < cp.plan.totalBookings;
      const isActive = cp.status === "ACTIVE";
      const isWithinValidity = cp.endDate >= today;
      return isActive && isWithinValidity && hasCredits;
    });

    // 🔹 Frequência e último atendimento
    const doneDates = doneAppointments.map((apt) => apt.scheduleAt);
    const frequencyLabel = buildFrequencyLabel(doneDates);

    const lastDoneDate =
      doneDates.length > 0
        ? new Date(Math.max(...doneDates.map((d) => d.getTime())))
        : null;

    // 🔹 Total gasto (sem taxa de cancelamento — aparece separado)
    const totalFromAppointments = doneAppointments.reduce((sum, apt) => {
      const price =
        apt.serviceId && servicePriceById.get(apt.serviceId as string);
      return sum + (Number(price) || 0);
    }, 0);

    const totalFromPlans = userClientPlans.reduce(
      (sum, cp) => sum + Number(cp.plan.price),
      0,
    );

    const totalSpent = totalFromAppointments + totalFromPlans;

    // WhatsApp
    const rawPhone = userPhone ?? "";
    const phoneDigits = rawPhone.replace(/\D/g, "");

    const baseName = user.name ?? "cliente";
    const whatsappMessage = `Olá ${baseName}! Tudo bem? Aqui é da barbearia. Vi seu cadastro aqui no sistema e queria saber se posso te ajudar com um novo agendamento. ✂️`;
    const whatsappUrl =
      phoneDigits.length > 0
        ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(
            whatsappMessage,
          )}`
        : null;

    return {
      id: user.id,
      name: user.name ?? "Cliente sem nome",
      email: user.email ?? "",
      phone: rawPhone || "—",
      createdAt: user.createdAt,
      totalAppointments,
      doneCount: doneAppointments.length,
      canceledCount: canceledAppointments.length,
      canceledWithFeeCount,
      totalCancelFee,
      totalPlans,
      hasActivePlan: !!activePlan,
      frequencyLabel,
      lastDoneDate,
      totalSpent,
      whatsappUrl,
    };
  });

  return (
    <div className="space-y-10 max-w-7xl">
      {/* HEADER */}
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title text-content-primary">Clientes</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Veja seus clientes, sua recorrência e quanto cada um movimenta na
            barbearia.
          </p>
        </div>
      </header>

      {/* TABELA */}
      <section className="space-y-4">
        <div className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border-primary bg-background-secondary/60">
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                  Cliente
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                  Criado em
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-content-secondary">
                  Agend.
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-content-secondary">
                  Concluídos
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-content-secondary">
                  Cancelados
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-content-secondary">
                  Canc. c/ taxa
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary">
                  Taxas cobradas
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-content-secondary">
                  Planos
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-content-secondary">
                  Plano ativo
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                  Frequência
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary">
                  Último atendimento
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary">
                  Total gasto
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary">
                  Ações
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={13}
                    className="px-4 py-6 text-center text-paragraph-small text-content-secondary"
                  >
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-border-primary">
                    {/* Cliente */}
                    <td className="px-4 py-3 align-middle">
                      <div className="flex flex-col">
                        <span className="font-medium text-content-primary">
                          {row.name}
                        </span>
                        <span className="text-xs text-content-secondary">
                          {row.email || "Sem e-mail"}
                        </span>
                        <span className="text-xs text-content-secondary">
                          {row.phone}
                        </span>
                      </div>
                    </td>

                    {/* Criado em */}
                    <td className="px-4 py-3 align-middle text-xs text-content-secondary">
                      {row.createdAt.toLocaleDateString("pt-BR")}
                    </td>

                    {/* Agend. */}
                    <td className="px-4 py-3 align-middle text-center text-xs">
                      {row.totalAppointments}
                    </td>

                    {/* Concluídos */}
                    <td className="px-4 py-3 align-middle text-center text-xs text-emerald-500">
                      {row.doneCount}
                    </td>

                    {/* Cancelados */}
                    <td className="px-4 py-3 align-middle text-center text-xs text-destructive">
                      {row.canceledCount}
                    </td>

                    {/* Cancelamentos com taxa */}
                    <td className="px-4 py-3 align-middle text-center text-xs text-amber-500">
                      {row.canceledWithFeeCount}
                    </td>

                    {/* Total taxas cobradas */}
                    <td className="px-4 py-3 align-middle text-right text-xs font-medium text-content-primary">
                      {formatCurrency(row.totalCancelFee)}
                    </td>

                    {/* Planos */}
                    <td className="px-4 py-3 align-middle text-center text-xs">
                      {row.totalPlans}
                    </td>

                    {/* Plano ativo */}
                    <td className="px-4 py-3 align-middle text-center">
                      <span
                        className={`inline-block rounded-full px-3 py-1 text-xs font-medium border ${
                          row.hasActivePlan
                            ? "border-emerald-500 text-emerald-500 bg-emerald-500/10"
                            : "border-border-primary text-content-secondary bg-background-secondary/60"
                        }`}
                      >
                        {row.hasActivePlan ? "Ativo" : "Sem plano"}
                      </span>
                    </td>

                    {/* Frequência */}
                    <td className="px-4 py-3 align-middle text-xs text-content-secondary">
                      {row.frequencyLabel}
                    </td>

                    {/* Último atendimento */}
                    <td className="px-4 py-3 align-middle text-xs text-content-secondary">
                      {row.lastDoneDate
                        ? row.lastDoneDate.toLocaleDateString("pt-BR")
                        : "—"}
                    </td>

                    {/* Total gasto */}
                    <td className="px-4 py-3 align-middle text-right text-xs font-medium text-content-primary">
                      {formatCurrency(row.totalSpent)}
                    </td>

                    {/* Ações */}
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center justify-end gap-2">
                        {row.whatsappUrl && (
                          <Link href={row.whatsappUrl} target="_blank">
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-border-primary hover:bg-muted/40 text-xs"
                            >
                              WhatsApp
                            </Button>
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
