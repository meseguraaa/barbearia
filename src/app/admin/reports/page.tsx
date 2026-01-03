// app/admin/reports/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  requireAdminPermission,
  type AdminWithPermissions,
} from "@/lib/admin-permissions";
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
  {
    href: "/admin/reports/analytics",
    title: "Analytics: Acesso & Conversão",
    description:
      "Acompanhe page views, impressões e cliques de produto, add-to-cart e conversões. Veja heatmap de acessos, top páginas e produtos mais quentes.",
    icon: BarChart3,
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

function trend(delta?: number) {
  if (!Number.isFinite(delta)) return { text: "—", tone: "muted" as const };
  if (delta !== undefined && Math.abs(delta) < 0.000001)
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

function TrendPill({ delta }: { delta?: number }) {
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
      : "border-rose-500/30 bg-rose-500/10 text-rose-200";

  return (
    <span className={cn("rounded-full px-2 py-1 text-[11px]", cls)}>
      {t.text}
    </span>
  );
}

type AdminReportsPageProps = {
  searchParams: Promise<{ month?: string }>;
};

export default async function AdminReportsPage({
  searchParams,
}: AdminReportsPageProps) {
  const admin = (await requireAdminPermission(
    "canAccessDashboard",
  )) as AdminWithPermissions;

  const companyId = admin.companyId;

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

  async function kpisForRange(rangeStart: Date, rangeEnd: Date) {
    const [apptTotal, apptDone, apptCanceled] = await Promise.all([
      prisma.appointment.count({
        where: {
          companyId,
          scheduleAt: { gte: rangeStart, lte: rangeEnd },
          ...(unitId ? { unitId } : {}),
        },
      }),
      prisma.appointment.count({
        where: {
          companyId,
          scheduleAt: { gte: rangeStart, lte: rangeEnd },
          status: "DONE",
          ...(unitId ? { unitId } : {}),
        },
      }),
      prisma.appointment.count({
        where: {
          companyId,
          scheduleAt: { gte: rangeStart, lte: rangeEnd },
          status: "CANCELED",
          ...(unitId ? { unitId } : {}),
        },
      }),
    ]);

    return { apptTotal, apptDone, apptCanceled };
  }

  const [curr, prev] = await Promise.all([
    kpisForRange(start, end),
    kpisForRange(prevStart, prevEnd),
  ]);

  const occupancy = curr.apptTotal > 0 ? curr.apptDone / curr.apptTotal : 0;
  const prevOccupancy = prev.apptTotal > 0 ? prev.apptDone / prev.apptTotal : 0;
  const occupancyDelta =
    prevOccupancy > 0 ? occupancy / prevOccupancy - 1 : undefined;

  const monthLabel = format(monthDate, "MMMM 'de' yyyy", { locale: ptBR });

  const withMonth = (href: string) =>
    `${href}?month=${encodeURIComponent(monthStr)}`;

  return (
    <div className="space-y-6 max-w-7xl">
      <header>
        <h1 className="text-title text-content-primary">Relatórios</h1>
        <p className="text-paragraph-medium-size text-content-secondary">
          Relatórios estratégicos para entender tendência, retenção, eficiência
          e gargalos.
        </p>
      </header>

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
              <div className="flex items-start gap-3">
                <Icon className="h-6 w-6 text-content-secondary shrink-0" />
                <div className="space-y-1">
                  <p className="text-label-large text-content-primary">
                    {r.title}
                  </p>
                  <p className="text-paragraph-small text-content-secondary">
                    {r.description}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
