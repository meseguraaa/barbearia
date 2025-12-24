import { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CustomerLevel } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Clientes",
};

const UNIT_COOKIE_NAME = "admin_unit_context";
const UNIT_ALL_VALUE = "all";

const LEVEL_RANK: Record<CustomerLevel, number> = {
  BRONZE: 1,
  PRATA: 2,
  OURO: 3,
  DIAMANTE: 4,
};

type LevelFilter = "all" | CustomerLevel;
function normalizeLevel(v: string | undefined): LevelFilter {
  if (v === "BRONZE") return "BRONZE";
  if (v === "PRATA") return "PRATA";
  if (v === "OURO") return "OURO";
  if (v === "DIAMANTE") return "DIAMANTE";
  return "all";
}

function levelLabel(level: CustomerLevel) {
  switch (level) {
    case "BRONZE":
      return "Bronze";
    case "PRATA":
      return "Prata";
    case "OURO":
      return "Ouro";
    case "DIAMANTE":
      return "Diamante";
  }
}

function levelBadgeClass(level: CustomerLevel) {
  switch (level) {
    case "BRONZE":
      return "bg-amber-500/10 text-amber-700 border-amber-500/30";
    case "PRATA":
      return "bg-slate-500/10 text-slate-200 border-slate-500/30";
    case "OURO":
      return "bg-yellow-500/10 text-yellow-700 border-yellow-500/30";
    case "DIAMANTE":
      return "bg-sky-500/10 text-sky-700 border-sky-500/30";
  }
}

function pickHighestLevel(levels: CustomerLevel[]): CustomerLevel {
  let best: CustomerLevel = "BRONZE";
  for (const l of levels) {
    if (LEVEL_RANK[l] > LEVEL_RANK[best]) best = l;
  }
  return best;
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

type ClientRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  image: string | null;
  createdAt: Date;
  birthday: Date | null;

  customerLevel: CustomerLevel;

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

function getSingleParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

type SortKey = "name_asc" | "name_desc" | "createdAt_desc" | "createdAt_asc";
function normalizeSort(v: string | undefined): SortKey {
  if (v === "name_desc") return "name_desc";
  if (v === "createdAt_desc") return "createdAt_desc";
  if (v === "createdAt_asc") return "createdAt_asc";
  return "name_asc";
}

type PlanFilter = "all" | "active" | "none";
function normalizePlan(v: string | undefined): PlanFilter {
  if (v === "active") return "active";
  if (v === "none") return "none";
  return "all";
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPermission("canAccessClients");

  const resolvedSearchParams = await searchParams;

  const qRaw = getSingleParam(resolvedSearchParams.q);
  const q = (qRaw ?? "").trim();

  const sort = normalizeSort(getSingleParam(resolvedSearchParams.sort));
  const plan = normalizePlan(getSingleParam(resolvedSearchParams.plan));
  const level = normalizeLevel(getSingleParam(resolvedSearchParams.level));

  const PAGE_SIZE = 10;

  const pageParamRaw = resolvedSearchParams?.page;
  const pageParam = Array.isArray(pageParamRaw)
    ? pageParamRaw[0]
    : pageParamRaw;

  const requestedPage = Number(pageParam ?? "1");
  const safeRequestedPage = Number.isFinite(requestedPage) ? requestedPage : 1;

  const whereUser: any = { role: "CLIENT" };

  if (q.length > 0) {
    whereUser.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
    ];
  }

  const orderBy =
    sort === "name_desc"
      ? ({ name: "desc" } as const)
      : sort === "createdAt_desc"
        ? ({ createdAt: "desc" } as const)
        : sort === "createdAt_asc"
          ? ({ createdAt: "asc" } as const)
          : ({ name: "asc" } as const);

  const totalClients = await prisma.user.count({ where: whereUser });

  const totalPages = Math.max(1, Math.ceil(totalClients / PAGE_SIZE));
  const page = clampInt(safeRequestedPage, 1, totalPages);

  const users = await prisma.user.findMany({
    where: whereUser,
    orderBy,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const cookieStore = await cookies();
  const selectedUnit =
    cookieStore.get(UNIT_COOKIE_NAME)?.value ?? UNIT_ALL_VALUE;

  const clientIds = users.map((u) => u.id);

  const levelStates = await prisma.customerLevelState.findMany({
    where: {
      userId: { in: clientIds },
      ...(selectedUnit !== UNIT_ALL_VALUE ? { unitId: selectedUnit } : {}),
    },
    select: {
      userId: true,
      unitId: true,
      levelCurrent: true,
    },
  });

  const levelByUserId = new Map<string, CustomerLevel>();

  if (selectedUnit !== UNIT_ALL_VALUE) {
    for (const st of levelStates) {
      levelByUserId.set(st.userId, st.levelCurrent);
    }
  } else {
    const levelsPerUser = new Map<string, CustomerLevel[]>();
    for (const st of levelStates) {
      const arr = levelsPerUser.get(st.userId) ?? [];
      arr.push(st.levelCurrent);
      levelsPerUser.set(st.userId, arr);
    }
    for (const [userId, levels] of levelsPerUser.entries()) {
      levelByUserId.set(userId, pickHighestLevel(levels));
    }
  }

  if (users.length === 0) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-title text-content-primary">Clientes</h1>
            <p className="text-paragraph-medium text-content-secondary">
              Nenhum cliente encontrado com esses filtros.
            </p>
          </div>

          <AdminNewClientDialog />
        </header>

        <section className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-4">
          <form method="GET" className="space-y-4">
            <div className="flex flex-col md:flex-row gap-3 md:items-end">
              <div className="flex-1">
                <label className="text-[11px] text-content-secondary">
                  Buscar
                </label>
                <Input
                  name="q"
                  defaultValue={q}
                  placeholder="Nome, e-mail ou telefone..."
                  className="h-10 bg-background-secondary border-border-primary"
                />
              </div>

              <div className="w-full md:w-[220px]">
                <label className="text-[11px] text-content-secondary">
                  Ordenar por
                </label>
                <select
                  name="sort"
                  defaultValue={sort}
                  className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
                >
                  <option value="name_asc">Nome (A-Z)</option>
                  <option value="name_desc">Nome (Z-A)</option>
                  <option value="createdAt_desc">Cadastro (mais novos)</option>
                  <option value="createdAt_asc">Cadastro (mais antigos)</option>
                </select>
              </div>

              <div className="w-full md:w-[220px]">
                <label className="text-[11px] text-content-secondary">
                  Plano
                </label>
                <select
                  name="plan"
                  defaultValue={plan}
                  className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
                >
                  <option value="all">Todos</option>
                  <option value="active">Com plano ativo</option>
                  <option value="none">Sem plano ativo</option>
                </select>
              </div>

              <div className="w-full md:w-[220px]">
                <label className="text-[11px] text-content-secondary">
                  Nível
                </label>
                <select
                  name="level"
                  defaultValue={level}
                  className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
                >
                  <option value="all">Todos</option>
                  <option value="BRONZE">Bronze</option>
                  <option value="PRATA">Prata</option>
                  <option value="OURO">Ouro</option>
                  <option value="DIAMANTE">Diamante</option>
                </select>
              </div>

              <div className="flex gap-2">
                <Button type="submit" variant="edit2">
                  Filtrar
                </Button>
                <Button asChild variant="destructive">
                  <Link href="/admin/clients">Limpar</Link>
                </Button>
              </div>
            </div>
          </form>
        </section>
      </div>
    );
  }

  const services = await prisma.service.findMany();
  const servicePriceById = new Map<string, number>(
    services.map((s) => [s.id, Number(s.price)]),
  );

  const appointments = await prisma.appointment.findMany({
    where: { clientId: { in: clientIds } },
    orderBy: { scheduleAt: "asc" },
  });

  const clientPlans = await prisma.clientPlan.findMany({
    where: { clientId: { in: clientIds } },
    include: { plan: true },
    orderBy: { startDate: "asc" },
  });

  const productOrders = await prisma.order.findMany({
    where: {
      clientId: { in: clientIds },
      status: "COMPLETED",
      items: { some: { productId: { not: null } } },
    },
    include: { items: true },
  });

  const today = new Date();

  const rows: ClientRow[] = users.map((user) => {
    const userAppointments = appointments.filter(
      (apt) => apt.clientId === user.id,
    );

    const totalAppointments = userAppointments.length;

    const doneAppointments = userAppointments.filter(
      (apt) => apt.status === "DONE",
    );
    const canceledAppointments = userAppointments.filter(
      (apt) => apt.status === "CANCELED",
    );

    const canceledWithFee = canceledAppointments.filter(
      (apt) => apt.cancelFeeApplied,
    );
    const canceledWithFeeCount = canceledWithFee.length;
    const totalCancelFee = canceledWithFee.reduce((sum, apt) => {
      const fee = apt.cancelFeeValue ? Number(apt.cancelFeeValue) : 0;
      return sum + fee;
    }, 0);

    const userClientPlans = clientPlans.filter((cp) => cp.clientId === user.id);
    const totalPlans = userClientPlans.length;

    const activePlan = userClientPlans.find((cp) => {
      const hasCredits = cp.usedBookings < cp.plan.totalBookings;
      const isActive = cp.status === "ACTIVE";
      const isWithinValidity = cp.endDate >= today;
      return isActive && isWithinValidity && hasCredits;
    });

    const doneDates = doneAppointments.map((apt) => apt.scheduleAt);
    const frequencyLabel = buildFrequencyLabel(doneDates);

    const lastDoneDate =
      doneDates.length > 0
        ? new Date(Math.max(...doneDates.map((d) => d.getTime())))
        : null;

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

    const rawPhone = user.phone ?? "";
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

      customerLevel: levelByUserId.get(user.id) ?? "BRONZE",

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

  const planFiltered =
    plan === "active"
      ? rows.filter((r) => r.hasActivePlan)
      : plan === "none"
        ? rows.filter((r) => !r.hasActivePlan)
        : rows;

  const filteredRows =
    level === "all"
      ? planFiltered
      : planFiltered.filter((r) => r.customerLevel === level);

  const { pages, showLeftEllipsis, showRightEllipsis, firstPage, lastPage } =
    getPageRange(page, totalPages);

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
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
        </div>

        <section className="rounded-xl border border-border-primary bg-background-tertiary p-4 space-y-4">
          <form method="GET" className="space-y-4">
            <div className="flex flex-col md:flex-row gap-3 md:items-end">
              <div className="flex-1">
                <label className="text-[11px] text-content-secondary">
                  Buscar
                </label>
                <Input
                  name="q"
                  defaultValue={q}
                  placeholder="Nome, e-mail ou telefone..."
                  className="h-10 bg-background-secondary border-border-primary"
                />
              </div>

              <div className="w-full md:w-[220px]">
                <label className="text-[11px] text-content-secondary">
                  Ordenar por
                </label>
                <select
                  name="sort"
                  defaultValue={sort}
                  className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
                >
                  <option value="name_asc">Nome (A-Z)</option>
                  <option value="name_desc">Nome (Z-A)</option>
                  <option value="createdAt_desc">Cadastro (mais novos)</option>
                  <option value="createdAt_asc">Cadastro (mais antigos)</option>
                </select>
              </div>

              <div className="w-full md:w-[220px]">
                <label className="text-[11px] text-content-secondary">
                  Plano
                </label>
                <select
                  name="plan"
                  defaultValue={plan}
                  className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
                >
                  <option value="all">Todos</option>
                  <option value="active">Com plano ativo</option>
                  <option value="none">Sem plano ativo</option>
                </select>
              </div>

              <div className="w-full md:w-[220px]">
                <label className="text-[11px] text-content-secondary">
                  Nível
                </label>
                <select
                  name="level"
                  defaultValue={level}
                  className="h-10 w-full rounded-md border border-border-primary bg-background-secondary px-3 text-sm text-content-primary"
                >
                  <option value="all">Todos</option>
                  <option value="BRONZE">Bronze</option>
                  <option value="PRATA">Prata</option>
                  <option value="OURO">Ouro</option>
                  <option value="DIAMANTE">Diamante</option>
                </select>
              </div>

              <div className="flex gap-2">
                <Button type="submit" variant="edit2">
                  Filtrar
                </Button>
                <Button asChild variant="outline">
                  <Link href="/admin/clients">Limpar</Link>
                </Button>
              </div>
            </div>
          </form>
        </section>
      </header>

      <section className="space-y-4">
        <Accordion type="single" collapsible className="space-y-2">
          {filteredRows.map((row) => (
            <AccordionItem
              key={row.id}
              value={row.id}
              className="border border-border-primary rounded-xl bg-background-tertiary"
            >
              <div className="flex items-center gap-6 px-4 py-3 w-full">
                {/* ✅ TRIGGER = GRID (inclui a coluna fixa da seta) */}
                <AccordionTrigger className="flex-1 min-w-0 px-0 py-0 hover:no-underline grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_32px] items-center gap-6">
                  {/* COL 1: Nome + Email */}
                  <div className="min-w-0 flex items-center gap-3 text-left">
                    <div className="h-10 w-10 rounded-full overflow-hidden bg-background-secondary border border-border-primary flex items-center justify-center shrink-0">
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

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-paragraph-medium-size font-semibold text-content-primary truncate">
                          {row.name}
                        </p>

                        {row.hasActivePlan && (
                          <Badge
                            variant="outline"
                            className="text-xs border-green-600/40 text-green-600 shrink-0"
                          >
                            Plano ativo
                          </Badge>
                        )}
                      </div>

                      <p className="text-xs text-content-secondary truncate">
                        {row.email || "Sem e-mail"}
                      </p>
                    </div>
                  </div>

                  {/* COL 2: Nível */}
                  <div className="hidden sm:flex flex-col text-left min-w-0">
                    <span className="text-[11px] text-content-secondary">
                      Nível
                    </span>
                    <div className="min-w-0">
                      <Badge
                        variant="outline"
                        className={`text-xs ${levelBadgeClass(row.customerLevel)}`}
                      >
                        {levelLabel(row.customerLevel)}
                      </Badge>
                    </div>
                  </div>

                  {/* COL 3: Telefone */}
                  <div className="hidden md:flex flex-col text-left min-w-0">
                    <span className="text-[11px] text-content-secondary">
                      Telefone
                    </span>
                    <span className="text-xs text-content-primary truncate">
                      {row.phone}
                    </span>
                  </div>

                  {/* COL 4: Último agendamento */}
                  <div className="hidden sm:flex flex-col text-left min-w-0">
                    <span className="text-[11px] text-content-secondary">
                      Último agendamento
                    </span>
                    <span className="text-xs text-content-primary truncate">
                      {row.lastDoneDate
                        ? format(row.lastDoneDate, "dd/MM/yyyy HH:mm", {
                            locale: ptBR,
                          })
                        : "Sem atendimento"}
                    </span>
                  </div>

                  {/* COL 5 é a seta do AccordionTrigger (automática) */}
                </AccordionTrigger>

                {/* ✅ AÇÕES grudadas no canto direito */}
                <div className="ml-auto flex items-center justify-end gap-2 whitespace-nowrap">
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
                          Nível:
                        </span>
                        <span className="flex-1 min-w-0 truncate">
                          <Badge
                            variant="outline"
                            className={`text-xs ${levelBadgeClass(row.customerLevel)}`}
                          >
                            {levelLabel(row.customerLevel)}
                          </Badge>
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
