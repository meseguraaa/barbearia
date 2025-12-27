// app/admin/reports/occupancy/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { MonthPicker } from "@/components/month-picker";
import { BarberFilter } from "@/components/barber-filter";
import { UnitFilter } from "@/components/unit-filter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parse } from "date-fns";
import type { AppointmentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Relatórios",
};

type AdminReportsOccupancyPageProps = {
  searchParams: Promise<{
    month?: string; // yyyy-MM
    barberId?: string;
    compareBarberId?: string;
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

// ===============================
// SP date parts from scheduleAt
// ===============================
function getSaoPauloHour(scheduleAt: Date): number {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIMEZONE,
    hour: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(scheduleAt);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return Number.isFinite(h) ? h : 0;
}

function getSaoPauloWeekdayIndex(scheduleAt: Date): number {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(scheduleAt);
  const d = Number(parts.find((p) => p.type === "day")?.value ?? "1");
  const m = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  const y = Number(parts.find((p) => p.type === "year")?.value ?? "1970");

  const calendarDate = new Date(y, m - 1, d);
  return calendarDate.getDay(); // 0=Dom ... 6=Sáb
}

// ===============================
// Heatmap utilities
// ===============================
const WEEKDAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function getIntensityClass(count: number, max: number) {
  if (max <= 0 || count <= 0) {
    return "bg-background-secondary text-content-tertiary border-border-primary";
  }

  const ratio = count / max;

  if (ratio <= 0.2)
    return "bg-emerald-500/10 text-content-primary border-emerald-500/20";
  if (ratio <= 0.4)
    return "bg-emerald-500/15 text-content-primary border-emerald-500/25";
  if (ratio <= 0.6)
    return "bg-emerald-500/20 text-content-primary border-emerald-500/30";
  if (ratio <= 0.8)
    return "bg-emerald-500/25 text-content-primary border-emerald-500/35";
  return "bg-emerald-500/30 text-content-primary border-emerald-500/40";
}

type HeatmapBuildResult = {
  heatmap: Map<number, Map<number, number>>;
  totalCount: number;
  maxCell: number;
  bestSlotLabel: string;
};

function buildHeatmap(appts: { scheduleAt: Date }[], hoursRange: number[]) {
  const minHour = hoursRange[0] ?? 8;
  const maxHour = hoursRange[hoursRange.length - 1] ?? 20;

  const heatmap = new Map<number, Map<number, number>>();
  for (let wd = 0; wd <= 6; wd++) heatmap.set(wd, new Map());

  let totalCount = 0;

  for (const a of appts) {
    const wd = getSaoPauloWeekdayIndex(a.scheduleAt);
    const h = getSaoPauloHour(a.scheduleAt);

    if (h < minHour || h > maxHour) continue;

    const row = heatmap.get(wd)!;
    row.set(h, (row.get(h) ?? 0) + 1);
    totalCount += 1;
  }

  let maxCell = 0;
  let bestSlot: { wd: number; h: number; count: number } | null = null;

  for (let wd = 0; wd <= 6; wd++) {
    const row = heatmap.get(wd)!;
    for (const h of hoursRange) {
      const c = row.get(h) ?? 0;
      if (c > maxCell) maxCell = c;
      if (!bestSlot || c > bestSlot.count) bestSlot = { wd, h, count: c };
    }
  }

  const bestSlotLabel =
    bestSlot && bestSlot.count > 0
      ? `${WEEKDAYS_PT[bestSlot.wd]} · ${String(bestSlot.h).padStart(
          2,
          "0",
        )}:00 (${bestSlot.count})`
      : "—";

  return { heatmap, totalCount, maxCell, bestSlotLabel };
}

type UnitOption = { id: string; name: string };

export default async function AdminReportsOccupancyPage({
  searchParams,
}: AdminReportsOccupancyPageProps) {
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

  const { month: monthParam, barberId, compareBarberId } = await searchParams;

  const referenceDate = monthParam
    ? parse(monthParam, "yyyy-MM", new Date())
    : new Date();

  const monthStart = startOfMonthSP(referenceDate);
  const monthEnd = endOfMonthSP(referenceDate);

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

  const compareBarberIdSafeRaw =
    compareBarberId && barbers.some((b) => b.id === compareBarberId)
      ? compareBarberId
      : null;

  const compareBarberIdSafe =
    compareBarberIdSafeRaw && compareBarberIdSafeRaw !== barberIdSafe
      ? compareBarberIdSafeRaw
      : null;

  const OCCUPANCY_STATUSES: AppointmentStatus[] = ["PENDING", "DONE"];

  const [apptsA, apptsB] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        scheduleAt: { gte: monthStart, lte: monthEnd },
        status: { in: OCCUPANCY_STATUSES },
        ...whereAppointmentUnit(activeUnitId),
        ...(barberIdSafe ? { barberId: barberIdSafe } : {}),
      },
      select: { scheduleAt: true },
    }),

    compareBarberIdSafe
      ? prisma.appointment.findMany({
          where: {
            scheduleAt: { gte: monthStart, lte: monthEnd },
            status: { in: OCCUPANCY_STATUSES },
            ...whereAppointmentUnit(activeUnitId),
            barberId: compareBarberIdSafe,
          },
          select: { scheduleAt: true },
        })
      : Promise.resolve([] as { scheduleAt: Date }[]),
  ]);

  const isSplit = !!compareBarberIdSafe;

  let minHour = 8;
  let maxHour = 20;

  const allForRange = isSplit ? [...apptsA, ...apptsB] : apptsA;

  if (allForRange.length > 0) {
    const hours = allForRange.map((a) => getSaoPauloHour(a.scheduleAt));
    const rawMin = Math.min(...hours);
    const rawMax = Math.max(...hours);

    minHour = clamp(rawMin, 6, 22);
    maxHour = clamp(rawMax, 6, 22);

    if (maxHour - minHour < 6) {
      minHour = clamp(minHour - 2, 6, 22);
      maxHour = clamp(maxHour + 2, 6, 22);
    }
  }

  const hoursRange = Array.from(
    { length: maxHour - minHour + 1 },
    (_, i) => minHour + i,
  );

  const heatA = buildHeatmap(apptsA, hoursRange);
  const heatB = buildHeatmap(apptsB, hoursRange);

  const maxCellGlobal = isSplit
    ? Math.max(heatA.maxCell, heatB.maxCell)
    : heatA.maxCell;

  const totalCountGlobal = isSplit
    ? heatA.totalCount + heatB.totalCount
    : heatA.totalCount;

  const selectedBarberName = barberIdSafe
    ? barbers.find((b) => b.id === barberIdSafe)?.name
    : null;

  const compareBarberName = compareBarberIdSafe
    ? barbers.find((b) => b.id === compareBarberIdSafe)?.name
    : null;

  const bestSlotGlobal = (() => {
    if (!isSplit) return heatA.bestSlotLabel;
    if (heatA.bestSlotLabel === "—" && heatB.bestSlotLabel === "—") return "—";

    let best: { wd: number; h: number; count: number } | null = null;

    for (let wd = 0; wd <= 6; wd++) {
      const rowA = heatA.heatmap.get(wd)!;
      const rowB = heatB.heatmap.get(wd)!;

      for (const h of hoursRange) {
        const c = (rowA.get(h) ?? 0) + (rowB.get(h) ?? 0);
        if (!best || c > best.count) best = { wd, h, count: c };
      }
    }

    if (!best || best.count <= 0) return "—";
    return `${WEEKDAYS_PT[best.wd]} · ${String(best.h).padStart(
      2,
      "0",
    )}:00 (${best.count})`;
  })();

  function HeatmapTable({
    title,
    subtitle,
    heatmap,
    maxCell,
  }: {
    title: string;
    subtitle?: string | null;
    heatmap: Map<number, Map<number, number>>;
    maxCell: number;
  }) {
    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-label-large text-content-primary">{title}</p>
            {subtitle ? (
              <p className="text-paragraph-small text-content-tertiary">
                {subtitle}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-content-tertiary">
            <span>menos</span>
            <span className="h-3 w-6 rounded border border-border-primary bg-background-secondary" />
            <span className="h-3 w-6 rounded border border-emerald-500/20 bg-emerald-500/10" />
            <span className="h-3 w-6 rounded border border-emerald-500/30 bg-emerald-500/20" />
            <span className="h-3 w-6 rounded border border-emerald-500/40 bg-emerald-500/30" />
            <span>mais</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-border-primary text-content-secondary">
                <th className="py-2 pr-3">Dia</th>
                {hoursRange.map((h) => (
                  <th key={h} className="py-2 px-2 text-center font-medium">
                    {String(h).padStart(2, "0")}h
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {WEEKDAYS_PT.map((label, wd) => {
                const row = heatmap.get(wd)!;

                return (
                  <tr
                    key={label}
                    className="border-b border-border-primary/60 last:border-0"
                  >
                    <td className="py-2 pr-3 text-content-primary font-medium whitespace-nowrap">
                      {label}
                    </td>

                    {hoursRange.map((h) => {
                      const count = row.get(h) ?? 0;
                      const intensity = getIntensityClass(count, maxCell);

                      return (
                        <td key={h} className="py-1 px-1">
                          <div
                            className={cn(
                              "h-9 rounded-md border flex items-center justify-center",
                              "transition-colors",
                              intensity,
                            )}
                            title={`${label} · ${String(h).padStart(
                              2,
                              "0",
                            )}:00 → ${count}`}
                          >
                            <span className="tabular-nums">
                              {count > 0 ? count : "·"}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <header className="space-y-3">
        {/* Linha 1: título + botão voltar */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-title text-content-primary">
            Ocupação da agenda
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
          {/* ✅ ordem: unidade - profissional - comparar com - mês */}
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
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

            {/* COMPARAR */}
            <div className="w-full [&_select]:h-12 [&_select]:min-h-12 [&_select]:py-2">
              <BarberFilter
                barbers={barbers}
                value={compareBarberIdSafe}
                paramKey="compareBarberId"
                label="Comparar com"
              />
            </div>

            {/* MÊS */}
            <div className="justify-self-end">
              <MonthPicker />
            </div>
          </div>

          <p className="mt-2 text-[11px] text-content-tertiary">
            Dica: compare dois profissionais para achar gargalos e oportunidades
            de encaixe.
          </p>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3">
          <p className="text-label-small text-content-secondary">
            Agendamentos contados (mês)
          </p>
          <p className="text-title text-content-primary">{totalCountGlobal}</p>

          {isSplit ? (
            <p className="mt-1 text-[11px] text-content-tertiary">
              {selectedBarberName ?? "Profissional A"}: {heatA.totalCount} •{" "}
              {compareBarberName ?? "Profissional B"}: {heatB.totalCount}
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3">
          <p className="text-label-small text-content-secondary">
            Slot mais concorrido
          </p>
          <p className="text-paragraph-medium-size text-content-primary">
            {bestSlotGlobal}
          </p>
          {isSplit ? (
            <p className="mt-1 text-[11px] text-content-tertiary">
              A: {heatA.bestSlotLabel} • B: {heatB.bestSlotLabel}
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3">
          <p className="text-label-small text-content-secondary">Faixa</p>
          <p className="text-paragraph-medium-size text-content-primary">
            {String(minHour).padStart(2, "0")}:00 até{" "}
            {String(maxHour).padStart(2, "0")}:00
          </p>
          {isSplit ? (
            <p className="mt-1 text-[11px] text-content-tertiary">
              Faixa alinhada para comparação justa
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-border-primary bg-background-tertiary p-4">
        {isSplit ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <HeatmapTable
              title={selectedBarberName ?? "Profissional A"}
              subtitle="Mesmo eixo de horas para comparar direto."
              heatmap={heatA.heatmap}
              maxCell={maxCellGlobal}
            />

            <HeatmapTable
              title={compareBarberName ?? "Profissional B"}
              subtitle="A intensidade usa a mesma escala do outro lado."
              heatmap={heatB.heatmap}
              maxCell={maxCellGlobal}
            />
          </div>
        ) : (
          <HeatmapTable
            title="Heatmap"
            subtitle="Linhas = dia da semana • colunas = hora • célula = quantidade"
            heatmap={heatA.heatmap}
            maxCell={maxCellGlobal}
          />
        )}
      </section>
    </div>
  );
}
