import { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { AdminNewClientDialog } from "@/components/admin-new-client-dialog";
import { createClientAction } from "./actions";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { WhatsAppLogo } from "@/components/icons/whatsapp-logo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Clientes",
};

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

type ClientRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  image: string | null;
  createdAt: Date;
  birthday: Date | null;

  totalAppointments: number;
  doneCount: number;
  canceledCount: number;
  canceledWithFeeCount: number;
  totalCancelFee: number;
  totalPlans: number;
  hasActivePlan: boolean;
  frequencyLabel: string;
  lastDoneDate: Date | null;
  totalSpent: number;

  whatsappUrl: string | null;
};

export default async function ClientsPage() {
  // 🔹 Todos os clientes
  const users = await prisma.user.findMany({
    where: { role: "CLIENT" },
    orderBy: { name: "asc" },
  });

  if (users.length === 0) {
    return (
      <div className="max-w-7xl space-y-6 mx-auto py-4">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-title text-content-primary">Clientes</h1>
            <p className="text-paragraph-medium-size text-content-secondary">
              Nenhum cliente cadastrado ainda.
            </p>
          </div>

          <AdminNewClientDialog />
        </header>
      </div>
    );
  }

  const clientIds = users.map((u) => u.id);
  const clientPhones = users
    .map((u) => (u as any).phone as string | null | undefined)
    .filter((p): p is string => !!p);

  // 🔹 Serviços (para fallback de preço quando não houver snapshot)
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

  // 🔹 Pedidos de PRODUTOS concluídos dos clientes
  const productOrders = await prisma.order.findMany({
    where: {
      clientId: { in: clientIds },
      status: "COMPLETED",
      items: {
        some: {
          productId: {
            not: null,
          },
        },
      },
    },
    include: {
      items: true,
    },
  });

  const today = new Date();

  const rows: ClientRow[] = users.map((user) => {
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

    // 🔹 Plano ativo
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

    // 🔹 Total gasto:
    //     - Planos: soma dos preços dos planos
    //     - Atendimentos avulsos: DONE que NÃO usam plano (clientPlanId null)
    //     - Produtos: pedidos de produtos COMPLETED desse cliente
    const totalFromAppointments = doneAppointments.reduce((sum, apt) => {
      if ((apt as any).clientPlanId) {
        return sum;
      }

      const snapshot = (apt as any).servicePriceAtTheTime as
        | number
        | bigint
        | null
        | undefined;

      if (snapshot != null) {
        return sum + Number(snapshot);
      }

      const price =
        apt.serviceId && servicePriceById.get(apt.serviceId as string);
      return sum + (Number(price) || 0);
    }, 0);

    const totalFromPlans = userClientPlans.reduce(
      (sum, cp) => sum + Number(cp.plan.price),
      0,
    );

    // 🔹 Produtos: soma dos pedidos de produto COMPLETED desse cliente
    const userProductOrders = productOrders.filter(
      (order) => order.clientId === user.id,
    );

    const totalFromProducts = userProductOrders.reduce(
      (sum, order) => sum + Number(order.totalAmount),
      0,
    );

    const totalSpent =
      totalFromAppointments + totalFromPlans + totalFromProducts;

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
      birthday: (user as any).birthday ?? null,
      image: user.image ?? null,
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
    <div className="space-y-8 max-w-7xl mx-auto py-4">
      {/* HEADER */}
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title text-content-primary">Clientes</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Veja seus clientes, sua recorrência e quanto cada um movimenta na
            barbearia.
          </p>
        </div>

        <AdminNewClientDialog />
      </header>

      {/* LISTA EM ACCORDION */}
      <section className="space-y-4">
        <Accordion type="single" collapsible className="space-y-2">
          {rows.map((row) => (
            <AccordionItem
              key={row.id}
              value={row.id}
              className="border border-border-primary rounded-xl bg-background-tertiary"
            >
              {/* CABEÇALHO: avatar, nome, email, telefone, último atendimento, ações */}
              <AccordionTrigger className="flex w-full items-center px-4 py-3 gap-4 hover:no-underline">
                {/* FOTO + NOME + E-MAIL */}
                <div className="flex-1 flex items-center gap-3 text-left">
                  {/* Foto do cliente */}
                  <div className="h-10 w-10 rounded-full overflow-hidden bg-background-secondary border border-border-primary flex items-center justify-center">
                    {row.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.image}
                        alt={row.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-medium text-content-secondary">
                        {row.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Texto */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <p className="text-paragraph-medium-size font-semibold text-content-primary">
                        {row.name}
                      </p>

                      {row.hasActivePlan && (
                        <Badge
                          variant="outline"
                          className="text-xs border-green-600/40 text-green-600"
                        >
                          Plano ativo
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs text-content-secondary truncate max-w-[220px]">
                      {row.email || "Sem e-mail"}
                    </p>
                  </div>
                </div>

                {/* TELEFONE */}
                <div className="hidden md:flex flex-col text-left min-w-40">
                  <span className="text-[11px] text-content-secondary">
                    Telefone
                  </span>
                  <span className="text-xs text-content-primary">
                    {row.phone}
                  </span>
                </div>

                {/* ÚLTIMO ATENDIMENTO */}
                <div className="hidden sm:flex flex-col text-left min-w-[180px]">
                  <span className="text-[11px] text-content-secondary">
                    Último atendimento
                  </span>
                  <span className="text-xs text-content-primary">
                    {row.lastDoneDate
                      ? format(row.lastDoneDate, "dd/MM/yyyy HH:mm", {
                          locale: ptBR,
                        })
                      : "Sem atendimento"}
                  </span>
                </div>

                {/* WHATSAPP */}
                <div className="flex items-center gap-2">
                  {row.whatsappUrl && (
                    <a
                      href={row.whatsappUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Enviar mensagem no WhatsApp"
                      className="inline-flex items-center justify-center size-9"
                    >
                      <WhatsAppLogo className="h-7 w-7" />
                      <span className="sr-only">WhatsApp</span>
                    </a>
                  )}
                </div>
              </AccordionTrigger>

              {/* CONTEÚDO: cards internos */}
              <AccordionContent className="border-t border-border-primary px-4 py-4">
                <div className="grid gap-4 md:grid-cols-3">
                  {/* Dados do cliente */}
                  <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-2">
                    <p className="text-label-small text-content-secondary">
                      Dados do cliente
                    </p>
                    <div className="space-y-1 text-paragraph-small">
                      <p>
                        <span className="text-content-secondary">Nome: </span>
                        <span className="text-content-primary font-medium">
                          {row.name}
                        </span>
                      </p>
                      <p>
                        <span className="text-content-secondary">E-mail: </span>
                        <span className="text-content-primary">
                          {row.email || "—"}
                        </span>
                      </p>
                      <p>
                        <span className="text-content-secondary">
                          Telefone:{" "}
                        </span>
                        <span className="text-content-primary">
                          {row.phone}
                        </span>
                      </p>
                      <p>
                        <span className="text-content-secondary">
                          Nascimento:{" "}
                        </span>
                        <span className="text-content-primary">
                          {row.birthday
                            ? format(row.birthday, "dd/MM/yyyy", {
                                locale: ptBR,
                              })
                            : "Não informado"}
                        </span>
                      </p>
                      <p>
                        <span className="text-content-secondary">
                          Cadastrado em:{" "}
                        </span>
                        <span className="text-content-primary">
                          {format(row.createdAt, "dd/MM/yyyy HH:mm", {
                            locale: ptBR,
                          })}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Atendimentos */}
                  <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-3">
                    <p className="text-label-small text-content-secondary">
                      Atendimentos
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-paragraph-small">
                      <div className="space-y-1">
                        <p className="text-content-secondary">Agendamentos</p>
                        <p className="text-content-primary font-semibold">
                          {row.totalAppointments}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-content-secondary">Concluídos</p>
                        <p className="text-content-primary font-semibold">
                          {row.doneCount}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-content-secondary">Cancelados</p>
                        <p className="text-content-primary font-semibold">
                          {row.canceledCount}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-content-secondary">Canc. c/ taxa</p>
                        <p className="text-content-primary font-semibold">
                          {row.canceledWithFeeCount}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1 text-paragraph-small">
                      <p className="text-content-secondary">Frequência</p>
                      <p className="text-content-primary font-medium">
                        {row.frequencyLabel}
                      </p>
                    </div>
                  </div>

                  {/* Financeiro / Planos */}
                  <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-3">
                    <p className="text-label-small text-content-secondary">
                      Financeiro
                    </p>

                    <div className="space-y-1 text-paragraph-small">
                      <p className="text-content-secondary">Total gasto</p>
                      <p className="text-content-primary font-semibold">
                        {row.totalSpent.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          minimumFractionDigits: 2,
                        })}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-paragraph-small">
                      <div className="space-y-1">
                        <p className="text-content-secondary">Planos</p>
                        <p className="text-content-primary font-semibold">
                          {row.totalPlans}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-content-secondary">
                          Taxas de cancelamento
                        </p>
                        <p className="text-content-primary font-semibold">
                          {row.totalCancelFee.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                            minimumFractionDigits: 2,
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1 text-paragraph-small">
                      <p className="text-content-secondary">Status</p>
                      {row.hasActivePlan ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/40">
                          Cliente de plano ativo
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-border-primary text-content-secondary"
                        >
                          Sem plano ativo
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  );
}
