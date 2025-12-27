import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { MonthPicker } from "@/components/month-picker";
import { BarberFilter } from "@/components/barber-filter";
import { UnitFilter } from "@/components/unit-filter";
import { CompareWithFilter } from "@/components/compare-with-filter";
import { RetentionWindowFilter } from "@/components/retention-window-filter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  parse,
  addDays,
  differenceInCalendarDays,
  subMonths,
  subYears,
  format,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import type { AppointmentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Relatórios",
};

type AdminReportsRetentionPageProps = {
  searchParams: Promise<{
    month?: string; // yyyy-MM
    barberId?: string;
    compare?: string; // "prev_month" | "prev_year"
    window?: string; // "30" | "60" | "90"
  }>;
};

const SAO_PAULO_TIMEZONE = "America/Sao_Paulo";
const UNIT_COOKIE_NAME = "admin_unit_context";
const UNIT_ALL_VALUE = "all";

// ===============================
// Timezone helpers (SP)
// ===============================
function getSaoPauloYMD(date: Date): { y: number; m: number; d: number } {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const d = Number(parts.find((p) => p.type === "day")?.value ?? "1");
  const m = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  const y = Number(parts.find((p) => p.type === "year")?.value ?? "1970");

  return { y, m, d };
}

// 00:00 em SP (UTC-03) = 03:00 UTC
function startOfMonthSP(date: Date): Date {
  const { y, m } = getSaoPauloYMD(date);
  return new Date(Date.UTC(y, m - 1, 1, 3, 0, 0));
}

function endOfMonthSP(date: Date): Date {
  const { y, m } = getSaoPauloYMD(date);
  const nextMonth = new Date(Date.UTC(y, m, 1, 3, 0, 0));
  return new Date(nextMonth.getTime() - 1);
}

// ===============================
// Unidade (mesma regra dos outros)
// ===============================
async function resolveUnitScope(admin: {
  unitId: string | null;
  canSeeAllUnits: boolean;
}) {
  if (!admin.canSeeAllUnits) return admin.unitId;

  const cookieStore = await cookies();
  const cookieValue =
    cookieStore.get(UNIT_COOKIE_NAME)?.value ?? UNIT_ALL_VALUE;

  if (!cookieValue || cookieValue === UNIT_ALL_VALUE) return null;
  return cookieValue;
}

function whereAppointmentUnit(unitId: string | null) {
  return unitId ? { unitId } : {};
}

type UnitOption = { id: string; name: string };

type CompareMode = "prev_month" | "prev_year";

function safeCompareMode(raw?: string): CompareMode {
  return raw === "prev_year" ? "prev_year" : "prev_month";
}

function compareLabel(mode: CompareMode) {
  return mode === "prev_year" ? "ano anterior" : "mês anterior";
}

type WindowDays = 30 | 60 | 90;

function safeWindowDays(raw?: string): WindowDays {
  const n = Number(raw);
  if (n === 60) return 60;
  if (n === 90) return 90;
  return 30;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}

function formatSignedInt(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}`;
}

function formatSignedPP(pp: number) {
  const sign = pp > 0 ? "+" : "";
  return `${sign}${Math.round(pp)} p.p.`;
}

type FirstByClientRow = {
  clientId: string | null;
  _min: { scheduleAt: Date | null };
};

type CohortItem = { clientId: string; firstAt: Date };

type RetentionCurveRow = {
  day: number; // 0..windowDays
  count: number;
  cumulativeCount: number;
  cumulativePct: number; // 0..100
};

function buildCurve(args: {
  dayCounts: number[];
  cohortSize: number;
  maxDay: number;
}) {
  const rows: RetentionCurveRow[] = [];
  let cum = 0;

  for (let day = 0; day <= args.maxDay; day++) {
    const c = args.dayCounts[day] ?? 0;
    cum += c;
    const pct = args.cohortSize > 0 ? (cum / args.cohortSize) * 100 : 0;

    rows.push({
      day,
      count: c,
      cumulativeCount: cum,
      cumulativePct: pct,
    });
  }

  return rows;
}

async function computeRetentionFromCohort(args: {
  cohort: CohortItem[];
  unitId: string | null;
  barberId: string | null;
  windowDays: WindowDays;
}) {
  const DONE_ONLY: AppointmentStatus[] = ["DONE"];
  const cohortClientIds = args.cohort.map((c) => c.clientId);

  if (cohortClientIds.length === 0) {
    return {
      cohortSize: 0,
      retainedCount: 0,
      lostCount: 0,
      retentionPct: NaN,
      avgReturnDays: NaN,
      dayCounts: Array.from({ length: args.windowDays + 1 }, () => 0),
    };
  }

  // Para evitar N queries, buscamos retornos num range amplo:
  // (minFirst, maxFirst+windowDays]
  const firstAts = args.cohort.map((c) => c.firstAt.getTime());
  const minFirst = new Date(Math.min(...firstAts) + 1); // evita contar o mesmo evento
  const maxFirst = new Date(Math.max(...firstAts));
  const maxWindowEnd = addDays(maxFirst, args.windowDays);

  const followups = await prisma.appointment.findMany({
    where: {
      clientId: { in: cohortClientIds },
      status: { in: DONE_ONLY },
      scheduleAt: { gt: minFirst, lte: maxWindowEnd },
      ...whereAppointmentUnit(args.unitId),
      ...(args.barberId ? { barberId: args.barberId } : {}),
    },
    select: { clientId: true, scheduleAt: true },
    orderBy: { scheduleAt: "asc" },
  });

  const followupsByClient = new Map<string, Date[]>();
  for (const f of followups) {
    if (!f.clientId) continue;
    const arr = followupsByClient.get(f.clientId) ?? [];
    arr.push(f.scheduleAt);
    followupsByClient.set(f.clientId, arr);
  }

  let retainedCount = 0;
  const returnDays: number[] = [];
  const dayCounts = Array.from({ length: args.windowDays + 1 }, () => 0);

  for (const c of args.cohort) {
    const windowEnd = addDays(c.firstAt, args.windowDays);
    const list = followupsByClient.get(c.clientId) ?? [];

    const firstReturn = list.find(
      (d) =>
        d.getTime() > c.firstAt.getTime() && d.getTime() <= windowEnd.getTime(),
    );

    if (firstReturn) {
      retainedCount += 1;

      const day = differenceInCalendarDays(firstReturn, c.firstAt);
      returnDays.push(day);

      const safeDay = Math.max(0, Math.min(args.windowDays, day));
      dayCounts[safeDay] = (dayCounts[safeDay] ?? 0) + 1;
    }
  }

  const cohortSize = args.cohort.length;
  const lostCount = cohortSize - retainedCount;
  const retentionPct =
    cohortSize > 0 ? (retainedCount / cohortSize) * 100 : NaN;

  const avgReturnDays =
    returnDays.length > 0
      ? returnDays.reduce((a, b) => a + b, 0) / returnDays.length
      : NaN;

  return {
    cohortSize,
    retainedCount,
    lostCount,
    retentionPct,
    avgReturnDays,
    dayCounts,
  };
}

type BarberRetentionRow = {
  barberId: string;
  barberName: string;
  cohortSize: number;
  retainedCount: number;
  lostCount: number;
  retentionPct: number; // NaN ok
  avgReturnDays: number; // NaN ok
};

export default async function AdminReportsRetentionPage({
  searchParams,
}: AdminReportsRetentionPageProps) {
  const admin = (await requireAdminPermission("canAccessDashboard")) as any;

  if (!admin?.canSeeAllUnits && !admin?.unitId) {
    throw new Error(
      "Admin de unidade sem unitId definido. Vincule este admin a uma unidade.",
    );
  }

  // Cookie atual (para pintar o filtro de unidade)
  const cookieStore = await cookies();
  const unitCookieValue =
    cookieStore.get(UNIT_COOKIE_NAME)?.value ?? UNIT_ALL_VALUE;

  const selectedUnitValue = admin?.canSeeAllUnits
    ? unitCookieValue
    : (admin?.unitId ?? "");

  const activeUnitId = await resolveUnitScope({
    unitId: admin?.unitId ?? null,
    canSeeAllUnits: !!admin?.canSeeAllUnits,
  });

  const { month: monthParam, barberId, compare, window } = await searchParams;

  const compareMode = safeCompareMode(compare);
  const windowDays = safeWindowDays(window);

  const referenceDate = monthParam
    ? parse(monthParam, "yyyy-MM", new Date())
    : new Date();

  const compareDate =
    compareMode === "prev_year"
      ? subYears(referenceDate, 1)
      : subMonths(referenceDate, 1);

  const monthStart = startOfMonthSP(referenceDate);
  const monthEnd = endOfMonthSP(referenceDate);

  const compareStart = startOfMonthSP(compareDate);
  const compareEnd = endOfMonthSP(compareDate);

  const monthLabel = format(referenceDate, "MMMM 'de' yyyy", { locale: ptBR });

  // ===== Unidades (para filtro)
  let units: UnitOption[] = [];
  let fixedUnitName: string | null = null;

  if (admin?.canSeeAllUnits) {
    units = await prisma.unit.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  } else if (admin?.unitId) {
    const u = await prisma.unit.findUnique({
      where: { id: admin.unitId },
      select: { name: true },
    });
    fixedUnitName = u?.name ?? null;
  }

  const ownerHasMultipleUnits = !!admin?.canSeeAllUnits && units.length > 1;
  const ownerSingleUnitName =
    !!admin?.canSeeAllUnits && units.length === 1 ? units[0]?.name : null;

  const unitLabel = admin?.canSeeAllUnits
    ? (ownerSingleUnitName ?? "Todas as unidades")
    : (fixedUnitName ?? "");

  // ===== Barbeiros (já respeita unidade selecionada)
  const barbers = activeUnitId
    ? await prisma.barber.findMany({
        where: {
          isActive: true,
          units: { some: { unitId: activeUnitId, isActive: true } },
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : await prisma.barber.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });

  const barberIdSafe =
    barberId && barbers.some((b) => b.id === barberId) ? barberId : null;

  const selectedBarberName = barberIdSafe
    ? barbers.find((b) => b.id === barberIdSafe)?.name
    : null;

  // ===============================
  // KPI engine (topo do relatório)
  // - "novos clientes do mês": clientes cuja PRIMEIRA visita (DONE) no escopo caiu no mês
  // ===============================
  const DONE_ONLY: AppointmentStatus[] = ["DONE"];

  const firstByClient = (await prisma.appointment.groupBy({
    by: ["clientId"],
    where: {
      status: { in: DONE_ONLY },
      ...whereAppointmentUnit(activeUnitId),
      ...(barberIdSafe ? { barberId: barberIdSafe } : {}),
    },
    _min: { scheduleAt: true },
  })) as unknown as FirstByClientRow[];

  const rows = firstByClient
    .filter((r) => r.clientId && r._min.scheduleAt)
    .map((r) => ({
      clientId: r.clientId as string,
      firstAt: r._min.scheduleAt as Date,
    }));

  const newClientsBase: CohortItem[] = rows.filter(
    (r) => r.firstAt >= monthStart && r.firstAt <= monthEnd,
  );

  const newClientsCompare: CohortItem[] = rows.filter(
    (r) => r.firstAt >= compareStart && r.firstAt <= compareEnd,
  );

  const [baseKpis, compareKpis] = await Promise.all([
    computeRetentionFromCohort({
      cohort: newClientsBase,
      unitId: activeUnitId,
      barberId: barberIdSafe,
      windowDays,
    }),
    computeRetentionFromCohort({
      cohort: newClientsCompare,
      unitId: activeUnitId,
      barberId: barberIdSafe,
      windowDays,
    }),
  ]);

  const retentionRateLabel = formatPercent(baseKpis.retentionPct);
  const retainedCount = baseKpis.retainedCount;
  const lostCount = baseKpis.lostCount;
  const avgReturnDaysLabel = Number.isFinite(baseKpis.avgReturnDays)
    ? `${Math.round(baseKpis.avgReturnDays)} dias`
    : "—";

  const retentionDeltaPP =
    Number.isFinite(baseKpis.retentionPct) &&
    Number.isFinite(compareKpis.retentionPct)
      ? baseKpis.retentionPct - compareKpis.retentionPct
      : NaN;

  const retainedDelta = retainedCount - (compareKpis.retainedCount ?? 0);
  const lostDelta = lostCount - (compareKpis.lostCount ?? 0);

  const avgDaysDelta =
    Number.isFinite(baseKpis.avgReturnDays) &&
    Number.isFinite(compareKpis.avgReturnDays)
      ? baseKpis.avgReturnDays - compareKpis.avgReturnDays
      : NaN;

  // ===== Curva 0..windowDays
  const curveRows = buildCurve({
    dayCounts: baseKpis.dayCounts,
    cohortSize: baseKpis.cohortSize,
    maxDay: windowDays,
  });

  const maxDayCount = Math.max(...baseKpis.dayCounts, 0);

  // ===============================
  // Clientes em risco
  // - "clientes novos do mês" (do topo)
  // - ainda não voltaram dentro da janela escolhida
  // ===============================
  const now = new Date();
  const baseIds = newClientsBase.map((c) => c.clientId);

  let riskRows: Array<{
    clientId: string;
    name: string | null;
    phone: string | null;
    firstAt: Date;
    daysSinceFirst: number;
    daysLeftToWindow: number;
    isOverdue: boolean;
  }> = [];

  if (baseIds.length > 0) {
    const firstAts = newClientsBase.map((c) => c.firstAt.getTime());
    const minFirst = new Date(Math.min(...firstAts) + 1);
    const maxFirst = new Date(Math.max(...firstAts));
    const maxWindowEnd = addDays(maxFirst, windowDays);

    const followups = await prisma.appointment.findMany({
      where: {
        clientId: { in: baseIds },
        status: { in: DONE_ONLY },
        scheduleAt: { gt: minFirst, lte: maxWindowEnd },
        ...whereAppointmentUnit(activeUnitId),
        ...(barberIdSafe ? { barberId: barberIdSafe } : {}),
      },
      select: { clientId: true, scheduleAt: true },
      orderBy: { scheduleAt: "asc" },
    });

    const firstReturnByClient = new Map<string, Date>();
    for (const f of followups) {
      if (!f.clientId) continue;
      if (!firstReturnByClient.has(f.clientId)) {
        firstReturnByClient.set(f.clientId, f.scheduleAt);
      }
    }

    const notReturned = newClientsBase.filter((c) => {
      const firstReturn = firstReturnByClient.get(c.clientId);
      if (!firstReturn) return true;
      const windowEnd = addDays(c.firstAt, windowDays);
      return firstReturn.getTime() > windowEnd.getTime();
    });

    const users = await prisma.user.findMany({
      where: { id: { in: notReturned.map((c) => c.clientId) } },
      select: { id: true, name: true, phone: true },
    });

    const userById = new Map(users.map((u) => [u.id, u]));

    riskRows = notReturned
      .map((c) => {
        const u = userById.get(c.clientId);
        const windowEnd = addDays(c.firstAt, windowDays);

        const daysSinceFirst = differenceInCalendarDays(now, c.firstAt);
        const daysLeftToWindow = differenceInCalendarDays(windowEnd, now);
        const isOverdue = now.getTime() > windowEnd.getTime();

        return {
          clientId: c.clientId,
          name: u?.name ?? null,
          phone: u?.phone ?? null,
          firstAt: c.firstAt,
          daysSinceFirst,
          daysLeftToWindow,
          isOverdue,
        };
      })
      .sort((a, b) => {
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        return a.daysLeftToWindow - b.daysLeftToWindow;
      })
      .slice(0, 20);
  }

  // ===============================
  // Retenção por profissional
  // - "Novos clientes da unidade no mês"
  // - linha do profissional: quem fez a 1ª visita com ele
  // - retorno do profissional: voltou com o mesmo profissional dentro da janela
  // - linha "Média da unidade": voltou na unidade dentro da janela (sem filtrar profissional)
  // ===============================
  const firstByClientAll = (await prisma.appointment.groupBy({
    by: ["clientId"],
    where: {
      status: { in: DONE_ONLY },
      ...whereAppointmentUnit(activeUnitId),
    },
    _min: { scheduleAt: true },
  })) as unknown as FirstByClientRow[];

  const rowsAll = firstByClientAll
    .filter((r) => r.clientId && r._min.scheduleAt)
    .map((r) => ({
      clientId: r.clientId as string,
      firstAt: r._min.scheduleAt as Date,
    }));

  const newClientsUnit: CohortItem[] = rowsAll.filter(
    (r) => r.firstAt >= monthStart && r.firstAt <= monthEnd,
  );

  const newClientsUnitIds = newClientsUnit.map((c) => c.clientId);

  // Map clientId -> barberId da 1ª visita (no mês)
  const firstAppointmentInMonth = newClientsUnitIds.length
    ? await prisma.appointment.findMany({
        where: {
          clientId: { in: newClientsUnitIds },
          status: { in: DONE_ONLY },
          scheduleAt: { gte: monthStart, lte: monthEnd },
          ...whereAppointmentUnit(activeUnitId),
        },
        orderBy: { scheduleAt: "asc" },
        distinct: ["clientId"],
        select: { clientId: true, scheduleAt: true, barberId: true },
      })
    : [];

  const firstBarberByClient = new Map<string, string | null>();
  for (const a of firstAppointmentInMonth) {
    firstBarberByClient.set(a.clientId, a.barberId ?? null);
  }

  const newClientsByBarber = new Map<string, CohortItem[]>();
  for (const c of newClientsUnit) {
    const bId = firstBarberByClient.get(c.clientId);
    if (!bId) continue;
    const arr = newClientsByBarber.get(bId) ?? [];
    arr.push(c);
    newClientsByBarber.set(bId, arr);
  }

  const unitAvgKpis = await computeRetentionFromCohort({
    cohort: newClientsUnit,
    unitId: activeUnitId,
    barberId: null,
    windowDays,
  });

  const unitAvgRow = {
    label: "Média da unidade",
    cohortSize: unitAvgKpis.cohortSize,
    retainedCount: unitAvgKpis.retainedCount,
    lostCount: unitAvgKpis.lostCount,
    retentionPct: unitAvgKpis.retentionPct,
    avgReturnDays: unitAvgKpis.avgReturnDays,
  };

  let barberTableRows: BarberRetentionRow[] = [];

  if (barberIdSafe) {
    const group = newClientsByBarber.get(barberIdSafe) ?? [];
    const k = await computeRetentionFromCohort({
      cohort: group,
      unitId: activeUnitId,
      barberId: barberIdSafe,
      windowDays,
    });

    const bName = barbers.find((b) => b.id === barberIdSafe)?.name ?? "—";

    barberTableRows = [
      {
        barberId: barberIdSafe,
        barberName: bName,
        cohortSize: k.cohortSize,
        retainedCount: k.retainedCount,
        lostCount: k.lostCount,
        retentionPct: k.retentionPct,
        avgReturnDays: k.avgReturnDays,
      },
    ];
  } else {
    const rowsPromises = barbers.map(async (b) => {
      const group = newClientsByBarber.get(b.id) ?? [];
      const k = await computeRetentionFromCohort({
        cohort: group,
        unitId: activeUnitId,
        barberId: b.id,
        windowDays,
      });

      return {
        barberId: b.id,
        barberName: b.name,
        cohortSize: k.cohortSize,
        retainedCount: k.retainedCount,
        lostCount: k.lostCount,
        retentionPct: k.retentionPct,
        avgReturnDays: k.avgReturnDays,
      } satisfies BarberRetentionRow;
    });

    barberTableRows = await Promise.all(rowsPromises);

    // Ordenar: pior retenção no topo. Se não tem "novos clientes", joga pro fim.
    barberTableRows.sort((a, b) => {
      const aHas = a.cohortSize > 0;
      const bHas = b.cohortSize > 0;
      if (aHas !== bHas) return aHas ? -1 : 1;

      const aVal = Number.isFinite(a.retentionPct) ? a.retentionPct : 999999;
      const bVal = Number.isFinite(b.retentionPct) ? b.retentionPct : 999999;
      if (aVal !== bVal) return aVal - bVal;

      return (b.cohortSize ?? 0) - (a.cohortSize ?? 0);
    });
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <header className="space-y-3">
        {/* Linha 1: título + botão voltar */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-title text-content-primary">
            Retenção de clientes
          </h1>

          <Button variant="outline" asChild>
            <Link href="/admin/reports">Voltar</Link>
          </Button>
        </div>

        {/* Linha 2: filtros */}
        <div
          className={cn(
            "rounded-xl border border-border-primary bg-background-tertiary p-3",
          )}
        >
          {/* ✅ ordem: unidade - profissional - comparar com - janela - mês */}
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto] md:items-end">
            {/* UNIDADE */}
            <div className="w-full [&_select]:h-12 [&_select]:min-h-12 [&_select]:py-2">
              {ownerHasMultipleUnits ? (
                <UnitFilter units={units} value={selectedUnitValue} />
              ) : (
                <div className="space-y-2">
                  <p className="text-label-small text-content-secondary">
                    Unidade
                  </p>
                  <div
                    className={cn(
                      "h-12 w-full rounded-md border border-border-primary",
                      "bg-background-secondary px-3",
                      "flex items-center",
                      "text-content-primary text-sm",
                    )}
                    title={unitLabel}
                  >
                    <span className="truncate">{unitLabel}</span>
                  </div>
                </div>
              )}
            </div>

            {/* PROFISSIONAL */}
            <div className="w-full [&_select]:h-12 [&_select]:min-h-12 [&_select]:py-2">
              <BarberFilter barbers={barbers} value={barberIdSafe} />
            </div>

            {/* COMPARAR COM */}
            <div className="w-full [&_select]:h-12 [&_select]:min-h-12 [&_select]:py-2">
              <CompareWithFilter value={compareMode} />
            </div>

            {/* JANELA */}
            <div className="w-full [&_select]:h-12 [&_select]:min-h-12 [&_select]:py-2">
              <RetentionWindowFilter value={windowDays} />
            </div>

            {/* MÊS */}
            <div className="justify-self-end">
              <MonthPicker />
            </div>
          </div>
        </div>
      </header>

      {/* KPIs */}
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3">
          <p className="text-label-small text-content-secondary">
            Retenção ({windowDays} dias)
          </p>
          <p className="text-title text-content-primary">
            {retentionRateLabel}
          </p>

          {/* ✅ Frase “na cara” */}
          <p className="mt-2 text-[12px] text-content-primary">
            De{" "}
            <span className="font-semibold tabular-nums">
              {baseKpis.cohortSize}
            </span>{" "}
            clientes novos,{" "}
            <span className="font-semibold tabular-nums">{retainedCount}</span>{" "}
            voltaram em até{" "}
            <span className="font-semibold tabular-nums">{windowDays}</span>{" "}
            dias.
          </p>

          <p className="mt-1 text-[11px] text-content-tertiary">
            {selectedBarberName ? `Filtro: ${selectedBarberName}` : "Todos"} •
            Mês: {monthLabel}
          </p>

          <p className="mt-1 text-[11px] text-content-tertiary">
            vs {compareLabel(compareMode)}:{" "}
            {Number.isFinite(retentionDeltaPP)
              ? formatSignedPP(retentionDeltaPP)
              : "—"}
          </p>
        </div>

        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3">
          <p className="text-label-small text-content-secondary">
            Voltaram ({windowDays} dias)
          </p>
          <p className="text-title text-content-primary">{retainedCount}</p>

          <p className="mt-1 text-[11px] text-content-tertiary">
            Clientes novos que voltaram em até {windowDays} dias
          </p>
          <p className="mt-1 text-[11px] text-content-tertiary">
            vs {compareLabel(compareMode)}: {formatSignedInt(retainedDelta)}
          </p>
        </div>

        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3">
          <p className="text-label-small text-content-secondary">
            Não voltaram ({windowDays} dias)
          </p>
          <p className="text-title text-content-primary">{lostCount}</p>

          <p className="mt-1 text-[11px] text-content-tertiary">
            Clientes novos que ainda não voltaram em {windowDays} dias
          </p>
          <p className="mt-1 text-[11px] text-content-tertiary">
            vs {compareLabel(compareMode)}: {formatSignedInt(lostDelta)}
          </p>
        </div>

        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3">
          <p className="text-label-small text-content-secondary">
            Tempo médio para voltar
          </p>
          <p className="text-title text-content-primary">
            {avgReturnDaysLabel}
          </p>

          <p className="mt-1 text-[11px] text-content-tertiary">
            Conta só quem voltou
          </p>
          <p className="mt-1 text-[11px] text-content-tertiary">
            vs {compareLabel(compareMode)}:{" "}
            {Number.isFinite(avgDaysDelta)
              ? `${avgDaysDelta > 0 ? "+" : ""}${Math.round(avgDaysDelta)} dias`
              : "—"}
          </p>
        </div>
      </section>

      {/* Curva de retorno 0..windowDays */}
      <section className="rounded-xl border border-border-primary bg-background-tertiary p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-label-large text-content-primary">
              Retorno ao longo de {windowDays} dias
            </p>
            <p className="text-paragraph-small text-content-tertiary">
              Mostra em qual dia os clientes novos voltam após a 1ª visita (e o
              acumulado até aquele dia).
            </p>
          </div>

          <div className="text-[11px] text-content-tertiary text-right">
            <div>Novos clientes: {baseKpis.cohortSize}</div>
            <div>Voltaram: {baseKpis.retainedCount}</div>
          </div>
        </div>

        {baseKpis.cohortSize === 0 ? (
          <div
            className={cn(
              "mt-4 h-24 w-full rounded-lg border border-border-primary",
              "bg-background-secondary",
              "flex items-center justify-center",
              "text-content-tertiary text-sm",
            )}
          >
            Sem novos clientes no mês selecionado.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-border-primary text-content-secondary">
                  <th className="py-2 pr-3">Dia</th>
                  <th className="py-2 pr-3">Voltas</th>
                  <th className="py-2 pr-3">Visual</th>
                  <th className="py-2 pr-3">Acumulado</th>
                </tr>
              </thead>

              <tbody>
                {curveRows.map((r) => {
                  const w =
                    maxDayCount > 0
                      ? Math.round((r.count / maxDayCount) * 100)
                      : 0;

                  return (
                    <tr
                      key={r.day}
                      className="border-b border-border-primary/60 last:border-0"
                    >
                      <td className="py-2 pr-3 text-content-primary font-medium tabular-nums">
                        {r.day}
                      </td>

                      <td className="py-2 pr-3 text-content-primary tabular-nums">
                        {r.count}
                      </td>

                      <td className="py-2 pr-3">
                        <div
                          className={cn(
                            "h-3 w-40 rounded bg-background-secondary border border-border-primary overflow-hidden",
                          )}
                          title={`${r.count} voltas no dia ${r.day}`}
                        >
                          <div
                            className="h-full bg-emerald-500/30"
                            style={{ width: `${w}%` }}
                          />
                        </div>
                      </td>

                      <td className="py-2 pr-3 text-content-primary tabular-nums">
                        {r.cumulativeCount}{" "}
                        <span className="text-content-tertiary">
                          ({Math.round(r.cumulativePct)}%)
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <p className="mt-2 text-[11px] text-content-tertiary">
              Leitura rápida: o “acumulado” é a retenção crescendo dia a dia
              dentro da janela de {windowDays} dias.
            </p>
          </div>
        )}
      </section>

      {/* Blocos: tabelas */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Retenção por profissional */}
        <div className="rounded-xl border border-border-primary bg-background-tertiary p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-label-large text-content-primary">
                Retenção por profissional
              </p>
              <p className="text-paragraph-small text-content-tertiary">
                Do menor para o maior (considerando clientes novos do mês).
              </p>
            </div>

            <div className="text-[11px] text-content-tertiary text-right">
              <div>Novos clientes na unidade: {unitAvgRow.cohortSize}</div>
              <div>
                Retenção da unidade: {formatPercent(unitAvgRow.retentionPct)}
              </div>
            </div>
          </div>

          {unitAvgRow.cohortSize === 0 ? (
            <div
              className={cn(
                "mt-4 h-48 w-full rounded-lg border border-border-primary",
                "bg-background-secondary",
                "flex items-center justify-center",
                "text-content-tertiary text-sm",
              )}
            >
              Sem clientes novos na unidade no mês selecionado.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-border-primary text-content-secondary">
                    <th className="py-2 pr-3">Profissional</th>
                    <th className="py-2 pr-3 text-right">Clientes novos</th>
                    <th className="py-2 pr-3 text-right">Voltaram</th>
                    <th className="py-2 pr-3 text-right">Não voltaram</th>
                    <th className="py-2 pr-3 text-right">Retenção</th>
                    <th className="py-2 pr-3 text-right">Tempo médio</th>
                  </tr>
                </thead>

                <tbody>
                  {barberTableRows.map((r) => {
                    const retLabel = formatPercent(r.retentionPct);
                    const avgDaysLabel = Number.isFinite(r.avgReturnDays)
                      ? `${Math.round(r.avgReturnDays)}d`
                      : "—";

                    return (
                      <tr
                        key={r.barberId}
                        className="border-b border-border-primary/60 last:border-0"
                      >
                        <td className="py-2 pr-3 text-content-primary font-medium whitespace-nowrap">
                          {r.barberName}
                          {barberIdSafe && r.barberId === barberIdSafe ? (
                            <span className="ml-2 text-[11px] text-content-tertiary">
                              (selecionado)
                            </span>
                          ) : null}
                        </td>

                        <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                          {r.cohortSize}
                        </td>

                        <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                          {r.retainedCount}
                        </td>

                        <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                          {r.lostCount}
                        </td>

                        <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                          {retLabel}
                        </td>

                        <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                          {avgDaysLabel}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Média da unidade */}
                  <tr className="border-t border-border-primary">
                    <td className="py-2 pr-3 text-content-primary font-medium">
                      {unitAvgRow.label}
                    </td>
                    <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                      {unitAvgRow.cohortSize}
                    </td>
                    <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                      {unitAvgRow.retainedCount}
                    </td>
                    <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                      {unitAvgRow.lostCount}
                    </td>
                    <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                      {formatPercent(unitAvgRow.retentionPct)}
                    </td>
                    <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                      {Number.isFinite(unitAvgRow.avgReturnDays)
                        ? `${Math.round(unitAvgRow.avgReturnDays)}d`
                        : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>

              <p className="mt-2 text-[11px] text-content-tertiary">
                Como ler: “Clientes novos” são os que fizeram a 1ª visita no
                mês. A retenção mede quantos voltaram em até {windowDays} dias.
              </p>
            </div>
          )}
        </div>

        {/* Clientes em risco */}
        <div className="rounded-xl border border-border-primary bg-background-tertiary p-4">
          <p className="text-label-large text-content-primary">
            Clientes em risco
          </p>
          <p className="text-paragraph-small text-content-tertiary">
            Clientes novos do mês que ainda não voltaram em até {windowDays}{" "}
            dias.
          </p>

          {baseKpis.cohortSize === 0 ? (
            <div
              className={cn(
                "mt-4 h-48 w-full rounded-lg border border-border-primary",
                "bg-background-secondary",
                "flex items-center justify-center",
                "text-content-tertiary text-sm",
              )}
            >
              Sem clientes novos no mês selecionado.
            </div>
          ) : riskRows.length === 0 ? (
            <div
              className={cn(
                "mt-4 h-48 w-full rounded-lg border border-border-primary",
                "bg-background-secondary",
                "flex items-center justify-center",
                "text-content-tertiary text-sm",
              )}
            >
              🎉 Ninguém em risco (todos voltaram em até {windowDays} dias).
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-border-primary text-content-secondary">
                    <th className="py-2 pr-3">Cliente</th>
                    <th className="py-2 pr-3">Telefone</th>
                    <th className="py-2 pr-3">1ª visita</th>
                    <th className="py-2 pr-3">Dias sem voltar</th>
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {riskRows.map((r) => (
                    <tr
                      key={r.clientId}
                      className="border-b border-border-primary/60 last:border-0"
                    >
                      <td className="py-2 pr-3 text-content-primary font-medium">
                        {r.name ?? "Sem nome"}
                      </td>

                      <td className="py-2 pr-3 text-content-primary tabular-nums">
                        {r.phone ?? "—"}
                      </td>

                      <td className="py-2 pr-3 text-content-primary">
                        {format(r.firstAt, "dd/MM/yyyy", { locale: ptBR })}
                      </td>

                      <td className="py-2 pr-3 text-content-primary tabular-nums">
                        {Math.max(0, r.daysSinceFirst)}d
                      </td>

                      <td className="py-2 pr-3">
                        {r.isOverdue ? (
                          <span className="text-[11px] rounded-full px-2 py-1 border border-rose-500/30 bg-rose-500/10 text-rose-200">
                            Passou de {windowDays} dias
                          </span>
                        ) : (
                          <span className="text-[11px] rounded-full px-2 py-1 border border-amber-500/30 bg-amber-500/10 text-amber-200">
                            Faltam {Math.max(0, r.daysLeftToWindow)} dias
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="mt-2 text-[11px] text-content-tertiary">
                Dica: comece por “Passou de {windowDays} dias”. Esses são os
                mais urgentes.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
