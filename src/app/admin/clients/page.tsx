import { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { AdminNewClientDialog } from "@/components/admin-new-client-dialog";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { WhatsAppLogo } from "@/components/icons/whatsapp-logo";
import { AdminEditClientDialog } from "@/components/admin-edit-client-dialog/admin-edit-client-dialog";
import { requireAdminPermission } from "@/lib/admin-permissions";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

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

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function buildPageHref(
  searchParams: Record<string, string | string[] | undefined>,
  nextPage: number,
) {
  const sp = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (value == null) continue;

    if (Array.isArray(value)) {
      for (const v of value) sp.append(key, v);
    } else {
      sp.set(key, value);
    }
  }

  sp.set("page", String(nextPage));
  return `?${sp.toString()}`;
}

function getPageRange(current: number, total: number) {
  // range pequeno e bonitinho (1 ... 4 5 [6] 7 8 ... 20)
  const delta = 2;
  const left = Math.max(1, current - delta);
  const right = Math.min(total, current + delta);

  const pages: number[] = [];
  for (let i = left; i <= right; i++) pages.push(i);

  const showLeftEllipsis = left > 2;
  const showRightEllipsis = right < total - 1;

  const firstPage = 1;
  const lastPage = total;

  return {
    pages,
    firstPage,
    lastPage,
    showLeftEllipsis,
    showRightEllipsis,
    showFirst: total >= 1,
    showLast: total >= 2,
  };
}

export default async function ClientsPage({
  searchParams,
}: {
  // ✅ Next App Router: searchParams é Promise e precisa await
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 🔐 Permissão: apenas admins com "Clientes" liberado (ou Dono) acessam
  await requireAdminPermission("canAccessClients");

  // ✅ resolve searchParams antes de usar
  const resolvedSearchParams = await searchParams;

  // =========================
  // PAGINAÇÃO
  // =========================
  const PAGE_SIZE = 10;

  const pageParamRaw = resolvedSearchParams?.page;
  const pageParam = Array.isArray(pageParamRaw)
    ? pageParamRaw[0]
    : pageParamRaw;

  const requestedPage = Number(pageParam ?? "1");
  const safeRequestedPage = Number.isFinite(requestedPage) ? requestedPage : 1;

  const totalClients = await prisma.user.count({
    where: { role: "CLIENT" },
  });

  const totalPages = Math.max(1, Math.ceil(totalClients / PAGE_SIZE));
  const page = clampInt(safeRequestedPage, 1, totalPages);

  const users = await prisma.user.findMany({
    where: { role: "CLIENT" },
    orderBy: { name: "asc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  if (users.length === 0) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
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
    .map((u) => u.phone)
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
    const userPhone = user.phone;

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

    // 🔹 Total gasto
    const totalFromAppointments = doneAppointments.reduce((sum, apt) => {
      if ((apt as any).clientPlanId) return sum;

      const snapshot = (apt as any).servicePriceAtTheTime as
        | number
        | bigint
        | null
        | undefined;

      if (snapshot != null) return sum + Number(snapshot);

      const price =
        apt.serviceId && servicePriceById.get(apt.serviceId as string);
      return sum + (Number(price) || 0);
    }, 0);

    const totalFromPlans = userClientPlans.reduce(
      (sum, cp) => sum + Number(cp.plan.price),
      0,
    );

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
        ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(whatsappMessage)}`
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

  const { pages, showLeftEllipsis, showRightEllipsis, firstPage, lastPage } =
    getPageRange(page, totalPages);

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* HEADER GERAL */}
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title text-content-primary">Clientes</h1>
          <p className="text-paragraph-medium text-content-secondary">
            Veja seus clientes, sua recorrência e quanto cada um movimenta na
            barbearia.
          </p>
          <p className="text-xs text-content-secondary mt-1">
            Mostrando{" "}
            <span className="font-semibold text-content-primary">
              {(page - 1) * PAGE_SIZE + 1}
            </span>{" "}
            a{" "}
            <span className="font-semibold text-content-primary">
              {Math.min(page * PAGE_SIZE, totalClients)}
            </span>{" "}
            de{" "}
            <span className="font-semibold text-content-primary">
              {totalClients}
            </span>
            .
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
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <AccordionTrigger className="flex flex-1 items-center gap-4 hover:no-underline px-0 py-0">
                  <div className="flex-1 flex items-center gap-3 text-left">
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

                  <div className="hidden md:flex flex-col text-left min-w-40">
                    <span className="text-[11px] text-content-secondary">
                      Telefone
                    </span>
                    <span className="text-xs text-content-primary">
                      {row.phone}
                    </span>
                  </div>

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
                </AccordionTrigger>

                <div className="flex items-center gap-2">
                  <AdminEditClientDialog
                    client={{
                      id: row.id,
                      name: row.name,
                      email: row.email,
                      phone: row.phone === "—" ? "" : row.phone,
                      birthday: row.birthday,
                    }}
                  />

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
              </div>

              <AccordionContent className="border-t border-border-primary px-4 py-4">
                <div className="grid gap-4 md:grid-cols-3">
                  {/* Dados do cliente */}
                  <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-2">
                    <p className="text-label-small text-content-primary">
                      Dados do cliente
                    </p>

                    <div className="space-y-2 text-paragraph-small">
                      <div className="flex items-center gap-2">
                        <span className="text-content-secondary shrink-0">
                          Nome:
                        </span>
                        <span className="text-content-primary font-medium flex-1 min-w-0 truncate">
                          {row.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-content-secondary shrink-0">
                          E-mail:
                        </span>
                        <span className="text-content-primary flex-1 min-w-0 truncate">
                          {row.email || "—"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-content-secondary shrink-0">
                          Telefone:
                        </span>
                        <span className="text-content-primary flex-1 min-w-0 truncate">
                          {row.phone}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-content-secondary shrink-0">
                          Nascimento:
                        </span>
                        <span className="text-content-primary flex-1 min-w-0 truncate">
                          {row.birthday
                            ? format(row.birthday, "dd/MM/yyyy", {
                                locale: ptBR,
                              })
                            : "Não informado"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-content-secondary shrink-0">
                          Cadastrado em:
                        </span>
                        <span className="text-content-primary flex-1 min-w-0 truncate">
                          {format(row.createdAt, "dd/MM/yyyy HH:mm", {
                            locale: ptBR,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Atendimentos */}
                  <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-2">
                    <p className="text-label-small text-content-primary">
                      Atendimentos
                    </p>

                    <div className="space-y-2 text-paragraph-small">
                      <div className="flex items-center gap-2">
                        <span className="text-content-secondary shrink-0">
                          Agendamentos:
                        </span>
                        <span className="text-content-primary font-semibold flex-1 min-w-0 truncate">
                          {row.totalAppointments}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-content-secondary shrink-0">
                          Concluídos:
                        </span>
                        <span className="text-content-primary font-semibold flex-1 min-w-0 truncate">
                          {row.doneCount}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-content-secondary shrink-0">
                          Cancelados:
                        </span>
                        <span className="text-content-primary font-semibold flex-1 min-w-0 truncate">
                          {row.canceledCount}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-content-secondary shrink-0">
                          Canc. c/ taxa:
                        </span>
                        <span className="text-content-primary font-semibold flex-1 min-w-0 truncate">
                          {row.canceledWithFeeCount}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-content-secondary shrink-0">
                          Frequência:
                        </span>
                        <span className="text-content-primary font-semibold flex-1 min-w-0 truncate">
                          {row.frequencyLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Financeiro / Planos */}
                  <div className="rounded-xl border border-border-primary bg-background-secondary p-4 space-y-3">
                    <p className="text-label-small text-content-primary">
                      Financeiro
                    </p>

                    <div className="space-y-2 text-paragraph-small">
                      <div className="flex items-center gap-2">
                        <span className="text-content-secondary shrink-0">
                          Total gasto:
                        </span>
                        <span className="text-content-primary font-semibold flex-1 min-w-0 truncate">
                          {row.totalSpent.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-content-secondary shrink-0">
                          Planos adquiridos:
                        </span>
                        <span className="text-content-primary font-semibold flex-1 min-w-0 truncate">
                          {row.totalPlans}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-content-secondary shrink-0">
                          Taxas de cancelamento:
                        </span>
                        <span className="text-content-primary font-semibold flex-1 min-w-0 truncate">
                          {row.totalCancelFee.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-content-secondary shrink-0">
                          Status do plano:
                        </span>
                        <span className="flex-1 min-w-0" />
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
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {/* PAGINAÇÃO (shadcn) */}
        {totalPages > 1 && (
          <div className="pt-4 flex justify-center">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href={buildPageHref(
                      resolvedSearchParams,
                      Math.max(1, page - 1),
                    )}
                    aria-disabled={page === 1}
                    className={
                      page === 1 ? "pointer-events-none opacity-50" : ""
                    }
                  />
                </PaginationItem>

                {/* Primeira página + ellipsis */}
                {page > 3 && (
                  <PaginationItem>
                    <PaginationLink
                      href={buildPageHref(resolvedSearchParams, firstPage)}
                    >
                      {firstPage}
                    </PaginationLink>
                  </PaginationItem>
                )}

                {showLeftEllipsis && (
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                )}

                {/* Miolo */}
                {pages.map((p) => (
                  <PaginationItem key={p}>
                    <PaginationLink
                      href={buildPageHref(resolvedSearchParams, p)}
                      isActive={p === page}
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                ))}

                {showRightEllipsis && (
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                )}

                {/* Última página */}
                {page < totalPages - 2 && (
                  <PaginationItem>
                    <PaginationLink
                      href={buildPageHref(resolvedSearchParams, lastPage)}
                    >
                      {lastPage}
                    </PaginationLink>
                  </PaginationItem>
                )}

                <PaginationItem>
                  <PaginationNext
                    href={buildPageHref(
                      resolvedSearchParams,
                      Math.min(totalPages, page + 1),
                    )}
                    aria-disabled={page === totalPages}
                    className={
                      page === totalPages
                        ? "pointer-events-none opacity-50"
                        : ""
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </section>
    </div>
  );
}
