// app/admin/reports/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { cn } from "@/lib/utils";
import { CalendarClock, Users2, Filter } from "lucide-react";

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

export default async function AdminReportsPage() {
  await requireAdminPermission("canAccessDashboard");

  return (
    <div className="space-y-6 max-w-7xl">
      <header className="space-y-2">
        <h1 className="text-title text-content-primary">Relatórios</h1>

        <p className="text-paragraph-small text-content-secondary">
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
              href={r.href}
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
