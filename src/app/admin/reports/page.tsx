// app/admin/reports/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { MonthPicker } from "@/components/month-picker";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
  Users2,
  Filter,
  Wallet,
  BarChart3,
  XCircle,
} from "lucide-react";
import { format, parse, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Relatórios",
};

type ReportCard = {
  href: string;
  title: string;
  description: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  badge?: string;
  badgeTone?: "ready" | "soon";
};

const reports: ReportCard[] = [
  {
    href: "/admin/reports/occupancy",
    title: "Ocupação da agenda",
    description:
      "Veja os horários de pico e de ociosidade da agenda por dia e hora. Compare profissionais e encontre oportunidades de encaixe.",
    icon: CalendarClock,
    badgeTone: "ready",
  },
  {
    href: "/admin/reports/retention",
    title: "Retenção de clientes",
    description:
      "Entenda se os clientes voltam após a primeira compra. Veja retorno em 30/60/90 dias e acompanhe a evolução mês a mês.",
    icon: Users2,
    badgeTone: "ready",
  },
  {
    href: "/admin/reports/funnel",
    title: "Funil do agendamento",
    description:
      "Acompanhe criados → realizados → pendentes/cancelados. Descubra onde a agenda não vira receita e onde está o gargalo.",
    icon: Filter,
    badgeTone: "ready",
  },
  {
    href: "/admin/reports/revenue",
    title: "Faturamento, Ticket & Comissão",
    description:
      "Entenda de onde vem o faturamento: mais atendimentos ou venda melhor. Veja receita, ticket médio, comissão e margem por profissional, serviço e produto.",
    icon: Wallet,
    badgeTone: "ready",
  },
];

function badgeClasses(tone: ReportCard["badgeTone"]) {
  if (tone === "ready") {
    return cn(
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
      "shadow-[0_0_0_1px_rgba(16,185,129,0.15)]",
    );
  }
  return "border border-border-primary bg-background-secondary text-content-tertiary";
}

const UNIT_COOKIE_NAME = "admin_unit_context";
const UNIT_ALL_VALUE = "all";

function formatMoneyBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPct(value: number) {
  return `${(value * 100).toFixed(1).replace(".", ",")}%`;
}

function trend(delta: number) {
  if (!Number.isFinite(delta)) return { text: "—", tone: "muted" as const };
  if (Math.abs(delta) < 0.000001)
    return { text: "0,0%", tone: "muted" as const };
  const up = delta > 0;
  const pct = `${Math.abs(delta * 100)
    .toFixed(1)
    .replace(".", ",")}%`;
  return {
    text: `${up ? "↑" : "↓"} ${pct}`,
    tone: up ? ("good" as const) : ("bad" as const),
  };
}

function TrendPill({ delta }: { delta: number }) {
  const t = trend(delta);
  if (t.text === "—") {
    return (
      <span className="rounded-full border border-border-primary bg-background-secondary px-2 py-1 text-[11px] text-content-tertiary">
        —
      </span>
    );
  }
  const cls =
    t.tone === "good"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : t.tone === "bad"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
        : "border border-border-primary bg-background-secondary text-content-tertiary";

  return (
    <span className={cn("rounded-full px-2 py-1 text-[11px]", cls)}>
      {t.text}
    </span>
  );
}

function KpiCard(props: {
  title: string;
  value: string;
  subtitle: string;
  delta?: number; // delta proporcional (ex: +0.12 = +12%)
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}) {
  const Icon = props.icon;

  return (
    <Link
      href={props.href}
      className={cn(
        "group rounded-2xl border border-border-primary bg-background-tertiary p-4",
        "transition-colors hover:bg-background-tertiary/70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Icon className="h-6 w-6 shrink-0 text-content-secondary" />
          <div className="space-y-1">
            <p className="text-paragraph-small text-content-secondary">
              {props.title}
            </p>
            <p className="text-title text-content-primary leading-none">
              {props.value}
            </p>
            <p className="text-paragraph-small text-content-tertiary">
              {props.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {typeof props.delta === "number" ? (
            <TrendPill delta={props.delta} />
          ) : null}
          <span className="text-paragraph-small text-content-tertiary opacity-0 transition-opacity group-hover:opacity-100">
            ver →
          </span>
        </div>
      </div>
    </Link>
  );
}

type AdminReportsPageProps = {
  searchParams: Promise<{
    month?: string; // yyyy-MM
  }>;
};

export default async function AdminReportsPage({
  searchParams,
}: AdminReportsPageProps) {
  await requireAdminPermission("canAccessDashboard");

  const sp = await searchParams;
  const monthStr = sp.month ?? format(new Date(), "yyyy-MM");
  const monthDate = parse(monthStr, "yyyy-MM", new Date());
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);

  const prevMonthDate = subMonths(monthDate, 1);
  const prevStart = startOfMonth(prevMonthDate);
  const prevEnd = endOfMonth(prevMonthDate);

  const unitCookie =
    (await cookies()).get(UNIT_COOKIE_NAME)?.value ?? UNIT_ALL_VALUE;
  const unitId = unitCookie !== UNIT_ALL_VALUE ? unitCookie : null;

  // ==========================
  // KPI DATA (schema real ✅)
  // ==========================
  async function kpisForRange(rangeStart: Date, rangeEnd: Date) {
    // 1) Agenda (Appointments)
    const [apptTotal, apptDone, apptCanceled] = await Promise.all([
      prisma.appointment.count({
        where: {
          scheduleAt: { gte: rangeStart, lte: rangeEnd },
          ...(unitId ? { unitId } : {}),
        },
      }),
      prisma.appointment.count({
        where: {
          scheduleAt: { gte: rangeStart, lte: rangeEnd },
          status: "DONE",
          ...(unitId ? { unitId } : {}),
        },
      }),
      prisma.appointment.count({
        where: {
          scheduleAt: { gte: rangeStart, lte: rangeEnd },
          status: "CANCELED",
          ...(unitId ? { unitId } : {}),
        },
      }),
    ]);

    // Receita de serviços: soma do servicePriceAtTheTime dos DONE
    const serviceAgg = await prisma.appointment.aggregate({
      where: {
        scheduleAt: { gte: rangeStart, lte: rangeEnd },
        status: "DONE",
        ...(unitId ? { unitId } : {}),
      },
      _sum: {
        servicePriceAtTheTime: true,
      },
    });

    // Produtos/itens (Orders COMPLETED) - usamos createdAt como referência do financeiro
    const orderAgg = await prisma.order.aggregate({
      where: {
        createdAt: { gte: rangeStart, lte: rangeEnd },
        status: "COMPLETED",
        ...(unitId ? { unitId } : {}),
      },
      _sum: {
        totalAmount: true,
      },
    });

    // Multa de cancelamento (BarberCancellationFee)
    const feeAgg = await prisma.barberCancellationFee.aggregate({
      where: {
        createdAt: { gte: rangeStart, lte: rangeEnd },
        ...(unitId ? { unitId } : {}),
      },
      _sum: {
        amount: true,
      },
    });

    const serviceRevenue = Number(serviceAgg._sum.servicePriceAtTheTime ?? 0);
    const productRevenue = Number(orderAgg._sum.totalAmount ?? 0);
    const cancelFeesRevenue = Number(feeAgg._sum.amount ?? 0);

    const totalRevenue = serviceRevenue + productRevenue + cancelFeesRevenue;

    return {
      apptTotal,
      apptDone,
      apptCanceled,
      serviceRevenue,
      productRevenue,
      cancelFeesRevenue,
      totalRevenue,
    };
  }

  const [curr, prev] = await Promise.all([
    kpisForRange(start, end),
    kpisForRange(prevStart, prevEnd),
  ]);

  // Ocupação (proxy executivo): realizados / total agendado
  const occupancy = curr.apptTotal > 0 ? curr.apptDone / curr.apptTotal : 0;
  const prevOccupancy = prev.apptTotal > 0 ? prev.apptDone / prev.apptTotal : 0;
  const occupancyDelta = prevOccupancy > 0 ? occupancy / prevOccupancy - 1 : 0;

  // Cancelamentos: cancelados / total
  const cancelRate =
    curr.apptTotal > 0 ? curr.apptCanceled / curr.apptTotal : 0;
  const prevCancelRate =
    prev.apptTotal > 0 ? prev.apptCanceled / prev.apptTotal : 0;
  const cancelDelta = prevCancelRate > 0 ? cancelRate / prevCancelRate - 1 : 0;

  // Faturamento: serviços + produtos + multas
  const revenue = curr.totalRevenue;
  const prevRevenue = prev.totalRevenue;
  const revenueDelta = prevRevenue > 0 ? revenue / prevRevenue - 1 : undefined;

  // Ticket médio (executivo): (serviços + produtos + multas) / atendimentos DONE
  const ticket = curr.apptDone > 0 ? revenue / curr.apptDone : 0;
  const prevTicket = prev.apptDone > 0 ? prev.totalRevenue / prev.apptDone : 0;
  const ticketDelta = prevTicket > 0 ? ticket / prevTicket - 1 : undefined;

  const monthLabel = format(monthDate, "MMMM 'de' yyyy", { locale: ptBR });

  const withMonth = (href: string) =>
    `${href}?month=${encodeURIComponent(monthStr)}`;

  return (
    <div className="space-y-6 max-w-7xl">
      <header className="">
        <h1 className="text-title text-content-primary">Relatórios</h1>

        <p className="text-paragraph-medium-size text-content-secondary">
          Relatórios estratégicos para entender tendência, retenção, eficiência
          e gargalos.
        </p>
      </header>

      {/* =========================
          Dashboard Executivo (sem “caixa” em volta)
         ========================= */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-label-large text-content-primary">
                Dashboard Executivo
              </h2>
            </div>

            <p className="text-paragraph-small text-content-secondary">
              Visão rápida do período:{" "}
              <span className="text-content-primary">{monthLabel}</span>
              {unitId ? (
                <span className="text-content-tertiary">
                  {" "}
                  · unidade selecionada
                </span>
              ) : (
                <span className="text-content-tertiary">
                  {" "}
                  · todas as unidades
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <MonthPicker />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            title="Ocupação"
            value={formatPct(occupancy)}
            subtitle="Realizados / agendados"
            delta={occupancyDelta}
            href={withMonth("/admin/reports/occupancy")}
            icon={CalendarClock}
          />

          <KpiCard
            title="Faturamento"
            value={formatMoneyBRL(revenue)}
            subtitle="Serviços + produtos + multas"
            delta={revenueDelta}
            href={withMonth("/admin/reports/revenue")}
            icon={Wallet}
          />

          <KpiCard
            title="Ticket médio"
            value={formatMoneyBRL(ticket)}
            subtitle="Receita / atendimentos (DONE)"
            delta={ticketDelta}
            href={withMonth("/admin/reports/revenue")}
            icon={Wallet}
          />

          <KpiCard
            title="Retenção"
            value="ver relatório"
            subtitle="30/60/90 dias"
            href={withMonth("/admin/reports/retention")}
            icon={Users2}
          />

          <KpiCard
            title="Cancelamentos"
            value={formatPct(cancelRate)}
            subtitle="Cancelados / agendados"
            delta={cancelDelta}
            href={withMonth("/admin/reports/funnel")}
            icon={XCircle}
          />
        </div>

        {/* Breakdown discreto, mas útil */}
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-border-primary bg-background-tertiary px-3 py-2">
            <p className="text-paragraph-small text-content-tertiary">
              Serviços
            </p>
            <p className="text-paragraph-medium-size text-content-primary">
              {formatMoneyBRL(curr.serviceRevenue)}
            </p>
          </div>
          <div className="rounded-xl border border-border-primary bg-background-tertiary px-3 py-2">
            <p className="text-paragraph-small text-content-tertiary">
              Produtos
            </p>
            <p className="text-paragraph-medium-size text-content-primary">
              {formatMoneyBRL(curr.productRevenue)}
            </p>
          </div>
          <div className="rounded-xl border border-border-primary bg-background-tertiary px-3 py-2">
            <p className="text-paragraph-small text-content-tertiary">Multas</p>
            <p className="text-paragraph-medium-size text-content-primary">
              {formatMoneyBRL(curr.cancelFeesRevenue)}
            </p>
          </div>
        </div>
      </section>

      {/* Cards de relatórios */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => {
          const Icon = r.icon;

          return (
            <Link
              key={r.href}
              href={withMonth(r.href)}
              className={cn(
                "group rounded-xl border border-border-primary bg-background-tertiary p-4",
                "transition-colors hover:bg-background-tertiary/70",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Icon className="h-6 w-6 text-content-secondary shrink-0" />

                  <div className="space-y-1">
                    <p className="text-label-large text-content-primary">
                      {r.title}
                    </p>

                    <p className="text-paragraph-small text-content-secondary line-clamp-3">
                      {r.description}
                    </p>
                  </div>
                </div>

                {r.badge && (
                  <span
                    className={cn(
                      "rounded-full px-2 py-1 text-[11px]",
                      badgeClasses(r.badgeTone),
                    )}
                  >
                    {r.badge}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
