// app/admin/reports/analytics/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { MonthPicker } from "@/components/month-picker";
import { UnitFilter } from "@/components/unit-filter";
import { CompareWithFilter } from "@/components/compare-with-filter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parse, subMonths, subYears, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Relatórios",
};

type AdminReportsAnalyticsPageProps = {
  searchParams: Promise<{
    month?: string; // yyyy-MM
    compare?: string; // "prev_month" | "prev_year"
  }>;
};

const SAO_PAULO_TIMEZONE = "America/Sao_Paulo";
const UNIT_COOKIE_NAME = "admin_unit_context";
const UNIT_ALL_VALUE = "all";
const COMPANY_COOKIE_NAME = "admin_company_context";

// ===============================
// ✅ Company resolver (sem te jogar pro login)
// ===============================
async function resolveCompanyIdOrThrow(admin: any): Promise<string> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(COMPANY_COOKIE_NAME)?.value;
  if (fromCookie) return fromCookie;

  const fromAdmin =
    (typeof admin?.companyId === "string" && admin.companyId) ||
    (typeof admin?.company?.id === "string" && admin.company.id);
  if (fromAdmin) return fromAdmin;

  const userId =
    (typeof admin?.userId === "string" && admin.userId) ||
    (typeof admin?.id === "string" && admin.id) ||
    (typeof admin?.sub === "string" && admin.sub);

  if (!userId) {
    throw new Error(
      "Não consegui resolver o userId do admin para achar a company.",
    );
  }

  const membership = await prisma.companyMember.findFirst({
    where: { userId, isActive: true },
    select: { companyId: true },
    orderBy: { createdAt: "asc" } as any,
  });

  if (!membership?.companyId) {
    throw new Error(
      `Company não definida para este admin. (cookie "${COMPANY_COOKIE_NAME}" ausente e sem membership ativa).`,
    );
  }

  return membership.companyId;
}

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

function startOfDaySP(date: Date): Date {
  const { y, m, d } = getSaoPauloYMD(date);
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
}

function endOfDaySP(date: Date): Date {
  return new Date(startOfDaySP(date).getTime() + 24 * 60 * 60 * 1000 - 1);
}

function dayKeyFromSP(date: Date) {
  const { y, m, d } = getSaoPauloYMD(date);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function dayLabelFromSP(date: Date) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: SAO_PAULO_TIMEZONE,
      day: "2-digit",
      month: "short",
    }).format(date);
  } catch {
    return dayKeyFromSP(date);
  }
}

function weekdayShortFromSP(date: Date) {
  try {
    const w = new Intl.DateTimeFormat("pt-BR", {
      timeZone: SAO_PAULO_TIMEZONE,
      weekday: "short",
    }).format(date);
    return String(w).replace(".", "").toLowerCase(); // seg, ter, qua...
  } catch {
    return "";
  }
}

function formatDateTimeSP(date: Date) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: SAO_PAULO_TIMEZONE,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function toSaoPauloParts(date: Date): { hour: number } {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIMEZONE,
    hour: "2-digit",
    hour12: false,
  });

  const parts = fmt.formatToParts(date);
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "00";
  const hour = Math.max(0, Math.min(23, Number(hourStr)));
  return { hour };
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

function whereUnit(unitId: string | null) {
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

// ===============================
// Format helpers
// ===============================
function safeDiv(num: number, den: number) {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return NaN;
  return num / den;
}

function pct(num: number, den: number) {
  const v = safeDiv(num, den);
  return Number.isFinite(v) ? v * 100 : NaN;
}

function formatInt(value: number) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(
    value,
  );
}

function formatSignedInt(n: number) {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${formatInt(n)}`;
}

function formatSignedPct(value: number) {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value)}%`;
}

function clamp01(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function safeString(v: any, max = 120) {
  const s = typeof v === "string" ? v : "";
  const t = s.trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max) : t;
}

// ===============================
// UI helpers
// ===============================
function KpiCard(props: { title: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3">
      <p className="text-label-small text-content-secondary">{props.title}</p>
      <p className="text-title text-content-primary tabular-nums">
        {props.value}
      </p>
      {props.sub ? (
        <p className="mt-1 text-[11px] text-content-tertiary">{props.sub}</p>
      ) : null}
    </div>
  );
}

export default async function AdminReportsAnalyticsPage({
  searchParams,
}: AdminReportsAnalyticsPageProps) {
  const admin = (await requireAdminPermission("canAccessDashboard")) as any;

  // ✅ resolve companyId sem depender do cookie (não redireciona pro login)
  const companyId = await resolveCompanyIdOrThrow(admin);

  if (!admin?.canSeeAllUnits && !admin?.unitId) {
    throw new Error(
      "Admin de unidade sem unitId definido. Vincule este admin a uma unidade.",
    );
  }

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

  // 🔒 sanity check: unidade pertence à empresa
  if (activeUnitId) {
    const ok = await prisma.unit.findFirst({
      where: { id: activeUnitId, companyId, isActive: true },
      select: { id: true },
    });
    if (!ok) redirect("/admin/reports");
  }

  const { month: monthParam, compare } = await searchParams;

  const compareMode = safeCompareMode(compare);

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

  // ===== Unidades (para filtro) ✅ companyId
  let units: UnitOption[] = [];
  let fixedUnitName: string | null = null;

  if (admin?.canSeeAllUnits) {
    units = await prisma.unit.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  } else if (admin?.unitId) {
    const u = await prisma.unit.findFirst({
      where: { id: admin.unitId, companyId },
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

  // ===============================
  // Analytics query ✅ companyId
  // ===============================
  const TRACKED = [
    "page_viewed",
    "product_impression",
    "product_click",
    "add_to_cart_success",
    "add_to_cart_attempt",
    "nav_click",
    "search_change",
    "filter_category",
    "action_click",
  ] as const;

  type AE = {
    name: string;
    ts: Date;
    userId: string | null;
    source: string | null;
    payload: any | null;
    context: any | null;
  };

  const [baseEvents, compareEvents] = await Promise.all([
    prisma.analyticsEvent.findMany({
      where: {
        companyId,
        ts: { gte: monthStart, lte: monthEnd },
        name: { in: TRACKED as any },
        ...whereUnit(activeUnitId),
      },
      select: {
        name: true,
        ts: true,
        userId: true,
        source: true,
        payload: true,
        context: true,
      },
      orderBy: { ts: "asc" },
      take: 50_000,
    }) as any as Promise<AE[]>,
    prisma.analyticsEvent.findMany({
      where: {
        companyId,
        ts: { gte: compareStart, lte: compareEnd },
        name: { in: TRACKED as any },
        ...whereUnit(activeUnitId),
      },
      select: {
        name: true,
        ts: true,
        userId: true,
        source: true,
        payload: true,
        context: true,
      },
      orderBy: { ts: "asc" },
      take: 50_000,
    }) as any as Promise<AE[]>,
  ]);

  // ===============================
  // KPIs
  // ===============================
  const countByName = (events: AE[]) => {
    const m = new Map<string, number>();
    for (const e of events) {
      m.set(e.name, (m.get(e.name) ?? 0) + 1);
    }
    return m;
  };

  const baseC = countByName(baseEvents);
  const cmpC = countByName(compareEvents);

  const basePageViews = baseC.get("page_viewed") ?? 0;
  const cmpPageViews = cmpC.get("page_viewed") ?? 0;

  const baseImpressions = baseC.get("product_impression") ?? 0;
  const cmpImpressions = cmpC.get("product_impression") ?? 0;

  const baseClicks = baseC.get("product_click") ?? 0;
  const cmpClicks = cmpC.get("product_click") ?? 0;

  const baseATC = baseC.get("add_to_cart_success") ?? 0;
  const cmpATC = cmpC.get("add_to_cart_success") ?? 0;

  const baseUniqueUsers = (() => {
    const s = new Set<string>();
    for (const e of baseEvents) if (e.userId) s.add(e.userId);
    return s.size;
  })();

  const cmpUniqueUsers = (() => {
    const s = new Set<string>();
    for (const e of compareEvents) if (e.userId) s.add(e.userId);
    return s.size;
  })();

  const baseCTR = pct(baseClicks, baseImpressions);
  const cmpCTR = pct(cmpClicks, cmpImpressions);

  const baseATCRate = pct(baseATC, baseClicks);
  const cmpATCRate = pct(cmpATC, cmpClicks);

  const pvDelta = basePageViews - cmpPageViews;
  const pvDeltaPct = pct(pvDelta, cmpPageViews);

  const uuDelta = baseUniqueUsers - cmpUniqueUsers;
  const uuDeltaPct = pct(uuDelta, cmpUniqueUsers);

  const impDelta = baseImpressions - cmpImpressions;
  const impDeltaPct = pct(impDelta, cmpImpressions);

  const clickDelta = baseClicks - cmpClicks;
  const clickDeltaPct = pct(clickDelta, cmpClicks);

  const ctrDeltaPP = baseCTR - cmpCTR;
  const atcDelta = baseATC - cmpATC;
  const atcDeltaPct = pct(atcDelta, cmpATC);

  const atcRateDeltaPP = baseATCRate - cmpATCRate;

  // ===============================
  // Último evento (SP) pra sanity check
  // ===============================
  const lastEvent = baseEvents.length
    ? baseEvents[baseEvents.length - 1]
    : null;
  const lastEventText = lastEvent
    ? `${safeString(lastEvent.name, 60)} • ${formatDateTimeSP(lastEvent.ts)} (SP)`
    : "—";

  // ===============================
  // Por dia (bucket em SP)
  // ===============================
  type DayRow = {
    key: string; // yyyy-MM-dd (SP)
    label: string; // 29/dez
    weekday: string; // seg/ter...
    pageViews: number;
    impressions: number;
    clicks: number;
    atc: number;
    total: number;
  };

  const dailyBucket = new Map<string, DayRow>();

  // ✅ pré-cria TODOS os dias do mês
  const monthDays: {
    key: string;
    date: Date;
    label: string;
    weekday: string;
  }[] = [];
  {
    let cursor = startOfDaySP(monthStart);
    const endCursor = endOfDaySP(monthEnd);

    while (cursor.getTime() <= endCursor.getTime()) {
      const key = dayKeyFromSP(cursor);
      const label = dayLabelFromSP(cursor);
      const weekday = weekdayShortFromSP(cursor);
      monthDays.push({ key, date: cursor, label, weekday });

      dailyBucket.set(key, {
        key,
        label,
        weekday,
        pageViews: 0,
        impressions: 0,
        clicks: 0,
        atc: 0,
        total: 0,
      });

      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  for (const e of baseEvents) {
    const key = dayKeyFromSP(e.ts);
    const row = dailyBucket.get(key);
    if (!row) continue;

    if (e.name === "page_viewed") row.pageViews += 1;
    if (e.name === "product_impression") row.impressions += 1;
    if (e.name === "product_click") row.clicks += 1;
    if (e.name === "add_to_cart_success") row.atc += 1;

    row.total += 1;
  }

  const dailyRows: DayRow[] = monthDays.map((d) => dailyBucket.get(d.key)!);

  // ===============================
  // Heatmap (Page views por DIA DO MÊS x HORA)
  // ===============================
  const dayIndex = new Map<string, number>();
  monthDays.forEach((d, i) => dayIndex.set(d.key, i));

  const heatDayHour = Array.from({ length: monthDays.length }, () =>
    Array(24).fill(0),
  );

  for (const e of baseEvents) {
    if (e.name !== "page_viewed") continue;
    const key = dayKeyFromSP(e.ts);
    const idx = dayIndex.get(key);
    if (idx == null) continue;

    const { hour } = toSaoPauloParts(e.ts);
    heatDayHour[idx][hour] += 1;
  }

  let heatMax = 0;
  for (const row of heatDayHour)
    for (const v of row) heatMax = Math.max(heatMax, v);

  // ===============================
  // Top páginas (page_viewed payload.page)
  // ===============================
  const topPages = (() => {
    const m = new Map<string, number>();
    for (const e of baseEvents) {
      if (e.name !== "page_viewed") continue;
      const page = safeString((e.payload as any)?.page, 80) || "(sem page)";
      m.set(page, (m.get(page) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([page, count]) => ({ page, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  })();

  // ===============================
  // Top produtos (impression/click/atc por productId)
  // ===============================
  type ProductAgg = {
    productId: string;
    impressions: number;
    clicks: number;
    atc: number;
  };

  const productsAgg = (() => {
    const m = new Map<string, ProductAgg>();
    const bump = (id: string, k: keyof Omit<ProductAgg, "productId">) => {
      const prev = m.get(id) ?? {
        productId: id,
        impressions: 0,
        clicks: 0,
        atc: 0,
      };
      prev[k] += 1;
      m.set(id, prev);
    };

    for (const e of baseEvents) {
      const pid =
        safeString((e.payload as any)?.productId, 80) ||
        safeString((e.payload as any)?.product?.id, 80) ||
        "";

      if (!pid) continue;

      if (e.name === "product_impression") bump(pid, "impressions");
      if (e.name === "product_click") bump(pid, "clicks");
      if (e.name === "add_to_cart_success") bump(pid, "atc");
    }

    return Array.from(m.values())
      .sort((a, b) => {
        const sa = a.atc * 100 + a.clicks * 10 + a.impressions;
        const sb = b.atc * 100 + b.clicks * 10 + b.impressions;
        return sb - sa;
      })
      .slice(0, 12);
  })();

  const productIds = productsAgg.map((p) => p.productId).filter(Boolean);

  // ✅ products também são tenant-scoped
  const productsInfo = productIds.length
    ? await prisma.product.findMany({
        where: { companyId, id: { in: productIds } },
        select: { id: true, name: true },
      })
    : [];

  const productNameMap = new Map(productsInfo.map((p) => [p.id, p.name]));

  // ===============================
  // Insights
  // ===============================
  const insights: string[] = [];

  if (baseEvents.length === 0) {
    insights.push("Sem eventos no período selecionado.");
  } else {
    if (pvDelta > 0) insights.push("Tráfego subiu no período.");
    if (pvDelta < 0) insights.push("Tráfego caiu no período.");

    if (Number.isFinite(baseCTR))
      insights.push(`CTR de produto: ~${Math.round(baseCTR)}%.`);
    if (Number.isFinite(baseATCRate)) {
      insights.push(
        `Conversão clique → carrinho: ~${Math.round(baseATCRate)}%.`,
      );
    }

    if (topPages[0]?.page) insights.push(`Página líder: ${topPages[0].page}.`);

    if (productsAgg[0]?.productId) {
      const name = productNameMap.get(productsAgg[0].productId);
      insights.push(
        `Produto mais quente: ${name ?? productsAgg[0].productId} (ATC: ${
          productsAgg[0].atc
        }).`,
      );
    }

    insights.push(`Último evento: ${lastEventText}.`);
  }

  const limitedInsights = insights.slice(0, 6);

  return (
    <div className="space-y-6 max-w-7xl">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-title text-content-primary">
            Analytics: Acesso, Interesse & Conversão
          </h1>

          <Button variant="outline" asChild>
            <Link href="/admin/reports">Voltar</Link>
          </Button>
        </div>

        <div
          className={cn(
            "rounded-xl border border-border-primary bg-background-tertiary p-3",
          )}
        >
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
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

            <div className="w-full [&_select]:h-12 [&_select]:min-h-12 [&_select]:py-2">
              <CompareWithFilter value={compareMode} />
            </div>

            <div className="justify-self-end">
              <MonthPicker />
            </div>
          </div>

          <div className="mt-3 text-[11px] text-content-tertiary">
            Escopo:{" "}
            <span className="text-content-primary">
              {unitLabel}
              {` • ${monthLabel}`}
            </span>
            <span className="ml-2 text-content-tertiary">
              · Último evento:{" "}
              <span className="text-content-primary">{lastEventText}</span>
            </span>
          </div>
        </div>
      </header>

      {/* KPIs */}
      <section className="grid gap-4 md:grid-cols-4">
        <KpiCard
          title="Page views"
          value={formatInt(basePageViews)}
          sub={`vs ${compareLabel(compareMode)}: ${formatInt(cmpPageViews)} (${formatSignedInt(
            pvDelta,
          )} | ${formatSignedPct(pvDeltaPct)})`}
        />

        <KpiCard
          title="Usuários únicos (logados)"
          value={formatInt(baseUniqueUsers)}
          sub={`vs ${compareLabel(compareMode)}: ${formatInt(
            cmpUniqueUsers,
          )} (${formatSignedInt(uuDelta)} | ${formatSignedPct(uuDeltaPct)})`}
        />

        <KpiCard
          title="Impressões de produto"
          value={formatInt(baseImpressions)}
          sub={`vs ${compareLabel(compareMode)}: ${formatInt(
            cmpImpressions,
          )} (${formatSignedInt(impDelta)} | ${formatSignedPct(impDeltaPct)})`}
        />

        <KpiCard
          title="Cliques em produto"
          value={formatInt(baseClicks)}
          sub={`vs ${compareLabel(compareMode)}: ${formatInt(
            cmpClicks,
          )} (${formatSignedInt(clickDelta)} | ${formatSignedPct(
            clickDeltaPct,
          )}) • CTR: ${
            Number.isFinite(baseCTR) ? `${Math.round(baseCTR)}%` : "—"
          }${
            Number.isFinite(ctrDeltaPP)
              ? ` (${ctrDeltaPP > 0 ? "+" : ""}${Math.round(ctrDeltaPP)} p.p.)`
              : ""
          }`}
        />
      </section>

      {/* Conversão */}
      <section className="grid gap-4 md:grid-cols-3">
        <KpiCard
          title="Add to cart (sucesso)"
          value={formatInt(baseATC)}
          sub={`vs ${compareLabel(compareMode)}: ${formatInt(
            cmpATC,
          )} (${formatSignedInt(atcDelta)} | ${formatSignedPct(atcDeltaPct)})`}
        />
        <KpiCard
          title="Conversão (impressão → clique)"
          value={Number.isFinite(baseCTR) ? `${Math.round(baseCTR)}%` : "—"}
          sub={`vs ${compareLabel(compareMode)}: ${
            Number.isFinite(cmpCTR) ? `${Math.round(cmpCTR)}%` : "—"
          }${
            Number.isFinite(ctrDeltaPP)
              ? ` (${ctrDeltaPP > 0 ? "+" : ""}${Math.round(ctrDeltaPP)} p.p.)`
              : ""
          }`}
        />
        <KpiCard
          title="Conversão (clique → carrinho)"
          value={
            Number.isFinite(baseATCRate) ? `${Math.round(baseATCRate)}%` : "—"
          }
          sub={`vs ${compareLabel(compareMode)}: ${
            Number.isFinite(cmpATCRate) ? `${Math.round(cmpATCRate)}%` : "—"
          }${
            Number.isFinite(atcRateDeltaPP)
              ? ` (${atcRateDeltaPP > 0 ? "+" : ""}${Math.round(
                  atcRateDeltaPP,
                )} p.p.)`
              : ""
          }`}
        />
      </section>

      {/* Insights */}
      <section className="rounded-xl border border-border-primary bg-background-tertiary p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-label-large text-content-primary">Insights</p>
            <p className="text-[11px] text-content-tertiary">
              Leitura rápida do que mudou no período.
            </p>
          </div>
        </div>

        {limitedInsights.length === 0 ? (
          <div
            className={cn(
              "mt-4 h-20 w-full rounded-lg border border-border-primary",
              "bg-background-secondary",
              "flex items-center justify-center",
              "text-content-tertiary text-sm",
            )}
          >
            Sem insights.
          </div>
        ) : (
          <ul className="mt-4 grid gap-2 md:grid-cols-2">
            {limitedInsights.map((t, idx) => (
              <li
                key={`${idx}-${t}`}
                className={cn(
                  "rounded-lg border border-border-primary bg-background-secondary px-3 py-2",
                  "text-[12px] text-content-primary",
                )}
              >
                {t}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Heatmap */}
      <section className="rounded-xl border border-border-primary bg-background-tertiary p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-label-large text-content-primary">
              Heatmap de acessos (page_viewed)
            </p>
            <p className="text-[11px] text-content-tertiary">
              Distribuição por dia do mês e hora (São Paulo).
            </p>
          </div>
          <div className="text-[11px] text-content-tertiary text-right">
            <div>Máximo por célula: {formatInt(heatMax)}</div>
            <div>Dias no mês: {monthDays.length}</div>
          </div>
        </div>

        {basePageViews === 0 ? (
          <div
            className={cn(
              "mt-4 h-28 w-full rounded-lg border border-border-primary",
              "bg-background-secondary",
              "flex items-center justify-center",
              "text-content-tertiary text-sm",
            )}
          >
            Sem page views no período.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-245 text-left text-[12px]">
              <thead>
                <tr className="border-b border-border-primary text-content-secondary">
                  <th className="py-2 pr-3">Dia</th>
                  {Array.from({ length: 24 }, (_, h) => (
                    <th key={h} className="py-2 px-2 text-center">
                      {String(h).padStart(2, "0")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatDayHour.map((row, idx) => {
                  const d = monthDays[idx];
                  return (
                    <tr
                      key={d.key}
                      className="border-b border-border-primary/60 last:border-0"
                    >
                      <td className="py-2 pr-3 text-content-primary font-medium whitespace-nowrap">
                        <div className="flex flex-col">
                          <span>
                            {d.label}{" "}
                            <span className="text-[11px] text-content-tertiary">
                              ({d.weekday})
                            </span>
                          </span>
                          <span className="text-[11px] text-content-tertiary">
                            {d.key}
                          </span>
                        </div>
                      </td>

                      {row.map((v, h) => {
                        const intensity = heatMax > 0 ? v / heatMax : 0;
                        const a = 0.06 + clamp01(intensity) * 0.55;

                        return (
                          <td key={h} className="py-2 px-2">
                            <div
                              className={cn(
                                "h-7 w-8 rounded-md border border-border-primary",
                                "flex items-center justify-center tabular-nums",
                                "text-[11px] text-content-primary",
                              )}
                              style={{
                                backgroundColor: `rgba(124,108,255,${a})`,
                              }}
                              title={`${d.key} • ${String(h).padStart(
                                2,
                                "0",
                              )}:00 • ${v} views`}
                            >
                              {v ? v : ""}
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
        )}
      </section>

      {/* Top produtos */}
      <section className="rounded-xl border border-border-primary bg-background-tertiary p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-label-large text-content-primary">
              Produtos: interesse e ação
            </p>
            <p className="text-[11px] text-content-tertiary">
              Baseado em impressões, cliques e add-to-cart (sucesso).
            </p>
          </div>
        </div>

        {productsAgg.length === 0 ? (
          <div
            className={cn(
              "mt-4 h-28 w-full rounded-lg border border-border-primary",
              "bg-background-secondary",
              "flex items-center justify-center",
              "text-content-tertiary text-sm",
            )}
          >
            Sem eventos de produto no período.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-border-primary text-content-secondary">
                  <th className="py-2 pr-3">Produto</th>
                  <th className="py-2 pr-3 text-right">Impressões</th>
                  <th className="py-2 pr-3 text-right">Cliques</th>
                  <th className="py-2 pr-3 text-right">CTR</th>
                  <th className="py-2 pr-3 text-right">Carrinho</th>
                  <th className="py-2 pr-3 text-right">Clique → Carrinho</th>
                </tr>
              </thead>
              <tbody>
                {productsAgg.map((r) => {
                  const name = productNameMap.get(r.productId);
                  const ctr = pct(r.clicks, r.impressions);
                  const c2c = pct(r.atc, r.clicks);

                  return (
                    <tr
                      key={r.productId}
                      className="border-b border-border-primary/60 last:border-0"
                    >
                      <td className="py-2 pr-3 text-content-primary font-medium">
                        <div className="flex flex-col">
                          <span className="truncate">
                            {name ?? r.productId}
                          </span>
                          {!name ? (
                            <span className="text-[11px] text-content-tertiary">
                              {r.productId}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                        {formatInt(r.impressions)}
                      </td>
                      <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                        {formatInt(r.clicks)}
                      </td>
                      <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                        {Number.isFinite(ctr) ? `${Math.round(ctr)}%` : "—"}
                      </td>
                      <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                        {formatInt(r.atc)}
                      </td>
                      <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                        {Number.isFinite(c2c) ? `${Math.round(c2c)}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
