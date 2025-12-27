// app/admin/reports/revenue/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { MonthPicker } from "@/components/month-picker";
import { BarberFilter } from "@/components/barber-filter";
import { UnitFilter } from "@/components/unit-filter";
import { CompareWithFilter } from "@/components/compare-with-filter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parse, subMonths, subYears, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { AppointmentStatus, OrderStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Relatórios",
};

type AdminReportsRevenuePageProps = {
  searchParams: Promise<{
    month?: string; // yyyy-MM
    barberId?: string;
    compare?: string; // "prev_month" | "prev_year"
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

function formatMoneyBRL(value: number) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatSignedMoney(value: number) {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatMoneyBRL(value)}`;
}

function formatSignedPct(value: number) {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value)}%`;
}

function formatSignedInt(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}`;
}

function toNumberDecimal(v: any): number {
  if (v == null) return NaN;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  }
  if (typeof v === "object") {
    if (typeof v.toNumber === "function") {
      const n = v.toNumber();
      return Number.isFinite(n) ? n : NaN;
    }
    if (typeof v.toString === "function") {
      const n = Number(String(v.toString()).replace(",", "."));
      return Number.isFinite(n) ? n : NaN;
    }
  }
  return NaN;
}

function monthKeyFromSP(date: Date) {
  const { y, m } = getSaoPauloYMD(date);
  return `${y}-${String(m).padStart(2, "0")}`;
}

// ===============================
// Regras financeiras (baseado no schema + actions.ts)
// ===============================
// Receita de atendimento DONE (✅ ajustado p/ priorizar snapshot):
// - Preferência absoluta: servicePriceAtTheTime (congelado no checkout)
// - Fallback: se existir order COMPLETED: usa order.totalAmount
// - Senão: usa service.price
function appointmentServiceRevenue(row: {
  servicePriceAtTheTime: any | null;
  service: { name: string; price: any; barberPercentage: any } | null;
  order: { status: OrderStatus; totalAmount: any } | null;
}): number {
  const atTheTime = toNumberDecimal(row.servicePriceAtTheTime);
  if (Number.isFinite(atTheTime) && atTheTime > 0) return atTheTime;

  const orderTotal =
    row.order?.status === "COMPLETED"
      ? toNumberDecimal(row.order?.totalAmount)
      : NaN;

  if (Number.isFinite(orderTotal) && orderTotal > 0) return orderTotal;

  const servicePrice = toNumberDecimal(row.service?.price);
  if (Number.isFinite(servicePrice) && servicePrice > 0) return servicePrice;

  return 0;
}

// Comissão de serviço:
// - Preferência absoluta: barberEarningValue (já “congelado”)
// - Senão: servicePriceAtTheTime * barberPercentageAtTheTime
// - Senão: service.price * service.barberPercentage
function appointmentServiceCommission(row: {
  barberEarningValue: any | null;
  barberPercentageAtTheTime: any | null;
  servicePriceAtTheTime: any | null;
  service: { price: any; barberPercentage: any } | null;
  order: { status: OrderStatus; totalAmount: any } | null;
}): number {
  const earning = toNumberDecimal(row.barberEarningValue);
  if (Number.isFinite(earning) && earning > 0) return earning;

  const priceAtTheTime = toNumberDecimal(row.servicePriceAtTheTime);
  const pctAtTheTime = toNumberDecimal(row.barberPercentageAtTheTime);

  if (
    Number.isFinite(priceAtTheTime) &&
    priceAtTheTime > 0 &&
    Number.isFinite(pctAtTheTime) &&
    pctAtTheTime >= 0
  ) {
    return (priceAtTheTime * pctAtTheTime) / 100;
  }

  const basePrice = toNumberDecimal(row.service?.price);
  const basePct = toNumberDecimal(row.service?.barberPercentage);

  if (
    Number.isFinite(basePrice) &&
    basePrice > 0 &&
    Number.isFinite(basePct) &&
    basePct >= 0
  ) {
    return (basePrice * basePct) / 100;
  }

  return 0;
}

// Comissão de produto = totalPrice * (product.barberPercentage / 100)
function productCommission(totalPrice: any, barberPercentage: any): number {
  const total = toNumberDecimal(totalPrice);
  const pctP = toNumberDecimal(barberPercentage);
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (!Number.isFinite(pctP) || pctP < 0) return 0;
  return (total * pctP) / 100;
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

export default async function AdminReportsRevenuePage({
  searchParams,
}: AdminReportsRevenuePageProps) {
  const admin = (await requireAdminPermission("canAccessDashboard")) as any;

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

  const { month: monthParam, barberId, compare } = await searchParams;

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

  // ===== Profissionais
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
  // Base queries
  // ===============================
  const STATUS_DONE: AppointmentStatus = "DONE";
  const STATUS_ORDER_COMPLETED: OrderStatus = "COMPLETED";

  const baseAppointmentsWhere = {
    scheduleAt: { gte: monthStart, lte: monthEnd },
    status: STATUS_DONE,
    ...whereUnit(activeUnitId),
    ...(barberIdSafe ? { barberId: barberIdSafe } : {}),
  };

  const compareAppointmentsWhere = {
    scheduleAt: { gte: compareStart, lte: compareEnd },
    status: STATUS_DONE,
    ...whereUnit(activeUnitId),
    ...(barberIdSafe ? { barberId: barberIdSafe } : {}),
  };

  // Vendas avulsas de produto (pedido COMPLETED e sem vínculo com appointment)
  // -> no fluxo, isso gera ProductSale, então vai bater certinho.
  const baseStandaloneOrdersWhere = {
    createdAt: { gte: monthStart, lte: monthEnd },
    status: STATUS_ORDER_COMPLETED,
    appointmentId: null as any,
    ...whereUnit(activeUnitId),
    ...(barberIdSafe ? { barberId: barberIdSafe } : {}),
  };

  const compareStandaloneOrdersWhere = {
    createdAt: { gte: compareStart, lte: compareEnd },
    status: STATUS_ORDER_COMPLETED,
    appointmentId: null as any,
    ...whereUnit(activeUnitId),
    ...(barberIdSafe ? { barberId: barberIdSafe } : {}),
  };

  // Comissão de produtos vem do ProductSale (que é criado no finalize dos produtos)
  const baseProductSalesWhere = {
    soldAt: { gte: monthStart, lte: monthEnd },
    ...whereUnit(activeUnitId),
    ...(barberIdSafe ? { barberId: barberIdSafe } : {}),
  };

  const compareProductSalesWhere = {
    soldAt: { gte: compareStart, lte: compareEnd },
    ...whereUnit(activeUnitId),
    ...(barberIdSafe ? { barberId: barberIdSafe } : {}),
  };

  const [
    baseAppointments,
    compareAppointments,
    baseStandaloneOrders,
    compareStandaloneOrders,
    baseProductSales,
    compareProductSales,
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: baseAppointmentsWhere,
      select: {
        id: true,
        unitId: true,
        barberId: true,
        scheduleAt: true,
        servicePriceAtTheTime: true,
        barberPercentageAtTheTime: true,
        barberEarningValue: true,
        service: {
          select: { name: true, price: true, barberPercentage: true },
        },
        order: { select: { status: true, totalAmount: true } },
      },
      orderBy: { scheduleAt: "asc" },
    }),
    prisma.appointment.findMany({
      where: compareAppointmentsWhere,
      select: {
        id: true,
        unitId: true,
        barberId: true,
        scheduleAt: true,
        servicePriceAtTheTime: true,
        barberPercentageAtTheTime: true,
        barberEarningValue: true,
        service: {
          select: { name: true, price: true, barberPercentage: true },
        },
        order: { select: { status: true, totalAmount: true } },
      },
      orderBy: { scheduleAt: "asc" },
    }),
    prisma.order.findMany({
      where: baseStandaloneOrdersWhere,
      select: {
        id: true,
        totalAmount: true,
        unitId: true,
        barberId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.order.findMany({
      where: compareStandaloneOrdersWhere,
      select: {
        id: true,
        totalAmount: true,
        unitId: true,
        barberId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.productSale.findMany({
      where: baseProductSalesWhere as any,
      select: {
        id: true,
        unitId: true,
        barberId: true,
        soldAt: true,
        totalPrice: true,
        product: { select: { name: true, barberPercentage: true } },
      },
      orderBy: { soldAt: "asc" },
    }),
    prisma.productSale.findMany({
      where: compareProductSalesWhere as any,
      select: {
        id: true,
        unitId: true,
        barberId: true,
        soldAt: true,
        totalPrice: true,
        product: { select: { name: true, barberPercentage: true } },
      },
      orderBy: { soldAt: "asc" },
    }),
  ]);

  // ===============================
  // Receita (base)
  // ===============================
  const baseServiceRevenue = baseAppointments
    .map((a) => appointmentServiceRevenue(a))
    .reduce((acc, v) => acc + v, 0);

  const compareServiceRevenue = compareAppointments
    .map((a) => appointmentServiceRevenue(a))
    .reduce((acc, v) => acc + v, 0);

  const baseStandaloneRevenue = baseStandaloneOrders
    .map((o) => toNumberDecimal(o.totalAmount))
    .map((v) => (Number.isFinite(v) ? v : 0))
    .reduce((acc, v) => acc + v, 0);

  const compareStandaloneRevenue = compareStandaloneOrders
    .map((o) => toNumberDecimal(o.totalAmount))
    .map((v) => (Number.isFinite(v) ? v : 0))
    .reduce((acc, v) => acc + v, 0);

  const baseDoneCount = baseAppointments.length;
  const compareDoneCount = compareAppointments.length;

  const baseTicket = safeDiv(baseServiceRevenue, baseDoneCount);
  const compareTicket = safeDiv(compareServiceRevenue, compareDoneCount);

  const baseTotalRevenue = baseServiceRevenue + baseStandaloneRevenue;
  const compareTotalRevenue = compareServiceRevenue + compareStandaloneRevenue;

  const revenueDelta = baseTotalRevenue - compareTotalRevenue;
  const revenueDeltaPct = pct(revenueDelta, compareTotalRevenue);

  const ticketDelta = baseTicket - compareTicket;
  const ticketDeltaPct = pct(ticketDelta, compareTicket);

  const standaloneDelta = baseStandaloneRevenue - compareStandaloneRevenue;
  const standaloneDeltaPct = pct(standaloneDelta, compareStandaloneRevenue);

  // ===============================
  // Comissão (base)
  // ===============================
  const baseServiceCommission = baseAppointments
    .map((a) => appointmentServiceCommission(a))
    .reduce((acc, v) => acc + v, 0);

  const compareServiceCommission = compareAppointments
    .map((a) => appointmentServiceCommission(a))
    .reduce((acc, v) => acc + v, 0);

  const baseProductCommission = baseProductSales
    .map((s) => productCommission(s.totalPrice, s.product?.barberPercentage))
    .reduce((acc, v) => acc + v, 0);

  const compareProductCommission = compareProductSales
    .map((s) => productCommission(s.totalPrice, s.product?.barberPercentage))
    .reduce((acc, v) => acc + v, 0);

  const baseTotalCommission = baseServiceCommission + baseProductCommission;
  const compareTotalCommission =
    compareServiceCommission + compareProductCommission;

  const commissionDelta = baseTotalCommission - compareTotalCommission;
  const commissionDeltaPct = pct(commissionDelta, compareTotalCommission);

  const baseGrossProfit = baseTotalRevenue - baseTotalCommission;
  const compareGrossProfit = compareTotalRevenue - compareTotalCommission;

  const profitDelta = baseGrossProfit - compareGrossProfit;
  const profitDeltaPct = pct(profitDelta, compareGrossProfit);

  const baseCommissionRatePct = pct(baseTotalCommission, baseTotalRevenue);
  const compareCommissionRatePct = pct(
    compareTotalCommission,
    compareTotalRevenue,
  );
  const commissionRateDeltaPP =
    baseCommissionRatePct - compareCommissionRatePct;

  // ===============================
  // Quebras
  // ===============================
  // Por profissional (serviço + produto + comissão + "lucro bruto" simples)
  type BarberRow = {
    barberId: string;
    barberName: string;
    serviceRevenue: number;
    productRevenue: number; // (produto) via ProductSale.totalPrice
    totalRevenue: number;
    serviceCommission: number;
    productCommission: number;
    totalCommission: number;
    grossProfit: number;
    doneCount: number;
    ticket: number;
  };

  const barberNameById = new Map(barbers.map((b) => [b.id, b.name]));

  const barberAgg = new Map<
    string,
    {
      serviceRevenue: number;
      doneCount: number;
      serviceCommission: number;
      productRevenue: number;
      productCommission: number;
    }
  >();

  for (const a of baseAppointments) {
    const bId = a.barberId ?? "unknown";
    const prev = barberAgg.get(bId) ?? {
      serviceRevenue: 0,
      doneCount: 0,
      serviceCommission: 0,
      productRevenue: 0,
      productCommission: 0,
    };

    prev.serviceRevenue += appointmentServiceRevenue(a);
    prev.serviceCommission += appointmentServiceCommission(a);
    prev.doneCount += 1;

    barberAgg.set(bId, prev);
  }

  for (const s of baseProductSales) {
    const bId = s.barberId ?? "unknown";
    const prev = barberAgg.get(bId) ?? {
      serviceRevenue: 0,
      doneCount: 0,
      serviceCommission: 0,
      productRevenue: 0,
      productCommission: 0,
    };

    const saleRev = toNumberDecimal(s.totalPrice);
    prev.productRevenue += Number.isFinite(saleRev) ? saleRev : 0;
    prev.productCommission += productCommission(
      s.totalPrice,
      s.product?.barberPercentage,
    );

    barberAgg.set(bId, prev);
  }

  let barberRows: BarberRow[] = Array.from(barberAgg.entries()).map(
    ([barberIdKey, v]) => {
      const totalRevenue = v.serviceRevenue + v.productRevenue;
      const totalCommission = v.serviceCommission + v.productCommission;
      const grossProfit = totalRevenue - totalCommission;

      return {
        barberId: barberIdKey,
        barberName:
          barberIdKey === "unknown"
            ? "—"
            : (barberNameById.get(barberIdKey) ?? "—"),
        serviceRevenue: v.serviceRevenue,
        productRevenue: v.productRevenue,
        totalRevenue,
        serviceCommission: v.serviceCommission,
        productCommission: v.productCommission,
        totalCommission,
        grossProfit,
        doneCount: v.doneCount,
        ticket: safeDiv(v.serviceRevenue, v.doneCount),
      };
    },
  );

  barberRows.sort((a, b) => b.totalRevenue - a.totalRevenue);

  // Por serviço (atendimentos DONE)
  type ServiceRow = {
    service: string;
    revenue: number;
    count: number;
    ticket: number;
    commission: number;
  };

  const byService = new Map<
    string,
    { revenue: number; count: number; commission: number }
  >();

  for (const a of baseAppointments) {
    const name = a.service?.name?.trim() || "(serviço não informado)";
    const prev = byService.get(name) ?? { revenue: 0, count: 0, commission: 0 };
    prev.revenue += appointmentServiceRevenue(a);
    prev.commission += appointmentServiceCommission(a);
    prev.count += 1;
    byService.set(name, prev);
  }

  const serviceRows: ServiceRow[] = Array.from(byService.entries())
    .map(([service, v]) => ({
      service,
      revenue: v.revenue,
      count: v.count,
      ticket: safeDiv(v.revenue, v.count),
      commission: v.commission,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 12);

  // Produtos mais vendidos (por receita) via ProductSale
  type ProductRow = {
    product: string;
    revenue: number;
    commission: number;
    salesCount: number;
  };

  const byProduct = new Map<
    string,
    { revenue: number; commission: number; salesCount: number }
  >();
  for (const s of baseProductSales) {
    const name = s.product?.name?.trim() || "(produto)";
    const prev = byProduct.get(name) ?? {
      revenue: 0,
      commission: 0,
      salesCount: 0,
    };

    const rev = toNumberDecimal(s.totalPrice);
    prev.revenue += Number.isFinite(rev) ? rev : 0;
    prev.commission += productCommission(
      s.totalPrice,
      s.product?.barberPercentage,
    );
    prev.salesCount += 1;

    byProduct.set(name, prev);
  }

  const productRows: ProductRow[] = Array.from(byProduct.entries())
    .map(([product, v]) => ({
      product,
      revenue: v.revenue,
      commission: v.commission,
      salesCount: v.salesCount,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 12);

  // ===============================
  // Evolução mês a mês (últimos 6 meses)
  // ===============================
  const monthsToShow = 6;
  const rangeStart = startOfMonthSP(subMonths(referenceDate, monthsToShow - 1));
  const rangeEnd = monthEnd;

  const evoAppointmentsWhere = {
    scheduleAt: { gte: rangeStart, lte: rangeEnd },
    status: STATUS_DONE,
    ...whereUnit(activeUnitId),
    ...(barberIdSafe ? { barberId: barberIdSafe } : {}),
  };

  const evoStandaloneOrdersWhere = {
    createdAt: { gte: rangeStart, lte: rangeEnd },
    status: STATUS_ORDER_COMPLETED,
    appointmentId: null as any,
    ...whereUnit(activeUnitId),
    ...(barberIdSafe ? { barberId: barberIdSafe } : {}),
  };

  const evoProductSalesWhere = {
    soldAt: { gte: rangeStart, lte: rangeEnd },
    ...whereUnit(activeUnitId),
    ...(barberIdSafe ? { barberId: barberIdSafe } : {}),
  };

  const [evoAppointments, evoStandaloneOrders, evoProductSales] =
    await Promise.all([
      prisma.appointment.findMany({
        where: evoAppointmentsWhere,
        select: {
          scheduleAt: true,
          servicePriceAtTheTime: true,
          barberPercentageAtTheTime: true,
          barberEarningValue: true,
          service: {
            select: { name: true, price: true, barberPercentage: true },
          },
          order: { select: { status: true, totalAmount: true } },
        },
        orderBy: { scheduleAt: "asc" },
      }),
      prisma.order.findMany({
        where: evoStandaloneOrdersWhere,
        select: { createdAt: true, totalAmount: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.productSale.findMany({
        where: evoProductSalesWhere as any,
        select: {
          soldAt: true,
          totalPrice: true,
          product: { select: { barberPercentage: true } },
        },
        orderBy: { soldAt: "asc" },
      }),
    ]);

  const evoBucket = new Map<
    string,
    {
      serviceRevenue: number;
      doneCount: number;
      standaloneRevenue: number;
      serviceCommission: number;
      productCommission: number;
    }
  >();

  for (const a of evoAppointments) {
    const key = monthKeyFromSP(a.scheduleAt);
    const prev = evoBucket.get(key) ?? {
      serviceRevenue: 0,
      doneCount: 0,
      standaloneRevenue: 0,
      serviceCommission: 0,
      productCommission: 0,
    };

    prev.serviceRevenue += appointmentServiceRevenue(a);
    prev.serviceCommission += appointmentServiceCommission(a);
    prev.doneCount += 1;

    evoBucket.set(key, prev);
  }

  for (const o of evoStandaloneOrders) {
    const key = monthKeyFromSP(o.createdAt);
    const prev = evoBucket.get(key) ?? {
      serviceRevenue: 0,
      doneCount: 0,
      standaloneRevenue: 0,
      serviceCommission: 0,
      productCommission: 0,
    };

    const n = toNumberDecimal(o.totalAmount);
    prev.standaloneRevenue += Number.isFinite(n) ? n : 0;

    evoBucket.set(key, prev);
  }

  for (const s of evoProductSales) {
    const key = monthKeyFromSP(s.soldAt);
    const prev = evoBucket.get(key) ?? {
      serviceRevenue: 0,
      doneCount: 0,
      standaloneRevenue: 0,
      serviceCommission: 0,
      productCommission: 0,
    };

    prev.productCommission += productCommission(
      s.totalPrice,
      s.product?.barberPercentage,
    );

    evoBucket.set(key, prev);
  }

  const evolution = [];
  for (let i = monthsToShow - 1; i >= 0; i--) {
    const dt = subMonths(referenceDate, i);
    const key = format(dt, "yyyy-MM");
    const label = format(dt, "MMM/yy", { locale: ptBR });

    const v = evoBucket.get(key) ?? {
      serviceRevenue: 0,
      doneCount: 0,
      standaloneRevenue: 0,
      serviceCommission: 0,
      productCommission: 0,
    };

    const totalRevenue = v.serviceRevenue + v.standaloneRevenue;
    const totalCommission = v.serviceCommission + v.productCommission;
    const grossProfit = totalRevenue - totalCommission;

    evolution.push({
      key,
      label,
      totalRevenue,
      serviceRevenue: v.serviceRevenue,
      standaloneRevenue: v.standaloneRevenue,
      doneCount: v.doneCount,
      ticket: safeDiv(v.serviceRevenue, v.doneCount),
      totalCommission,
      grossProfit,
    });
  }

  // ===============================
  // Insights (resposta do dono + margem)
  // ===============================
  const insights: string[] = [];

  if (baseDoneCount === 0 && baseStandaloneRevenue === 0) {
    insights.push("Sem receita no período selecionado.");
  } else {
    const countDelta = baseDoneCount - compareDoneCount;

    if (revenueDelta > 0) {
      if (countDelta > 0 && ticketDelta > 0) {
        insights.push(
          "Você cresceu pelos dois lados: mais atendimentos e ticket médio maior.",
        );
      } else if (countDelta > 0) {
        insights.push(
          "Crescimento puxado por volume: mais atendimentos realizados.",
        );
      } else if (ticketDelta > 0) {
        insights.push(
          "Crescimento puxado por venda melhor: ticket médio subiu.",
        );
      } else {
        insights.push(
          "Faturamento subiu. Cheque se veio principalmente de pedidos (produtos).",
        );
      }
    } else if (revenueDelta < 0) {
      insights.push(
        "Queda no faturamento. Olhe volume (atendimentos) e ticket para achar o motivo.",
      );
    }

    if (baseStandaloneRevenue > 0) {
      insights.push(
        `Vendas avulsas no mês: ${formatMoneyBRL(baseStandaloneRevenue)}.`,
      );
    }

    if (Number.isFinite(baseCommissionRatePct)) {
      insights.push(
        `Comissão representa ~${Math.round(baseCommissionRatePct)}% da receita (margem bruta simples ~${Math.round(
          pct(baseGrossProfit, baseTotalRevenue),
        )}%).`,
      );
    }

    if (serviceRows.length > 0) {
      insights.push(`Serviço líder em receita: ${serviceRows[0].service}.`);
    }

    if (!barberIdSafe && barberRows.length > 0) {
      const top = barberRows[0];
      insights.push(
        `Top do mês: ${top.barberName} (${formatMoneyBRL(top.totalRevenue)}).`,
      );
    }
  }

  const limitedInsights = insights.slice(0, 5);

  return (
    <div className="space-y-6 max-w-7xl">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-title text-content-primary">
            Faturamento, Ticket & Comissão
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
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
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
              <BarberFilter barbers={barbers} value={barberIdSafe} />
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
              {selectedBarberName ? ` • ${selectedBarberName}` : ""}
              {` • ${monthLabel}`}
            </span>
          </div>
        </div>
      </header>

      {/* KPIs */}
      <section className="grid gap-4 md:grid-cols-4">
        <KpiCard
          title="Faturamento total"
          value={formatMoneyBRL(baseTotalRevenue)}
          sub={`vs ${compareLabel(compareMode)}: ${formatMoneyBRL(
            compareTotalRevenue,
          )} (${formatSignedMoney(revenueDelta)} | ${formatSignedPct(
            revenueDeltaPct,
          )})`}
        />

        <KpiCard
          title="Ticket médio (atendimento)"
          value={formatMoneyBRL(baseTicket)}
          sub={`vs ${compareLabel(compareMode)}: ${formatMoneyBRL(
            compareTicket,
          )} (${formatSignedMoney(ticketDelta)} | ${formatSignedPct(
            ticketDeltaPct,
          )})`}
        />

        <KpiCard
          title="Comissão total"
          value={formatMoneyBRL(baseTotalCommission)}
          sub={`vs ${compareLabel(compareMode)}: ${formatMoneyBRL(
            compareTotalCommission,
          )} (${formatSignedMoney(commissionDelta)} | ${formatSignedPct(
            commissionDeltaPct,
          )})`}
        />

        <KpiCard
          title="Margem bruta (simples)"
          value={formatMoneyBRL(baseGrossProfit)}
          sub={`vs ${compareLabel(compareMode)}: ${formatMoneyBRL(
            compareGrossProfit,
          )} (${formatSignedMoney(profitDelta)} | ${formatSignedPct(
            profitDeltaPct,
          )}) • Comissão: ${
            Number.isFinite(baseCommissionRatePct)
              ? `${Math.round(baseCommissionRatePct)}%`
              : "—"
          }${
            Number.isFinite(commissionRateDeltaPP)
              ? ` (${commissionRateDeltaPP > 0 ? "+" : ""}${Math.round(
                  commissionRateDeltaPP,
                )} p.p.)`
              : ""
          }`}
        />
      </section>

      {/* Mix receita */}
      <section className="grid gap-4 md:grid-cols-3">
        <KpiCard
          title="Receita de serviços"
          value={formatMoneyBRL(baseServiceRevenue)}
          sub={`Comissão serviços: ${formatMoneyBRL(baseServiceCommission)}`}
        />
        <KpiCard
          title="Vendas avulsas"
          value={formatMoneyBRL(baseStandaloneRevenue)}
          sub={`Comissão produtos: ${formatMoneyBRL(baseProductCommission)}`}
        />
        <KpiCard
          title="Atendimentos realizados"
          value={`${baseDoneCount}`}
          sub={`vs ${compareLabel(compareMode)}: ${compareDoneCount} (${formatSignedInt(
            baseDoneCount - compareDoneCount,
          )})`}
        />
      </section>

      {/* Evolução mês a mês */}
      <section className="rounded-xl border border-border-primary bg-background-tertiary p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-label-large text-content-primary">
              Evolução mês a mês
            </p>
          </div>
          <div className="text-[11px] text-content-tertiary text-right">
            <div>Unidade: {unitLabel}</div>
            <div>Mês: {monthLabel}</div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-border-primary text-content-secondary">
                <th className="py-2 pr-3">Mês</th>
                <th className="py-2 pr-3 text-right">Receita</th>
                <th className="py-2 pr-3 text-right">Serviços</th>
                <th className="py-2 pr-3 text-right">Pedidos</th>
                <th className="py-2 pr-3 text-right">Comissão</th>
                <th className="py-2 pr-3 text-right">Margem</th>
                <th className="py-2 pr-3 text-right">Atend.</th>
                <th className="py-2 pr-3 text-right">Ticket</th>
              </tr>
            </thead>
            <tbody>
              {evolution.map((r) => (
                <tr
                  key={r.key}
                  className="border-b border-border-primary/60 last:border-0"
                >
                  <td className="py-2 pr-3 text-content-primary font-medium whitespace-nowrap">
                    {r.label}
                  </td>
                  <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                    {formatMoneyBRL(r.totalRevenue)}
                  </td>
                  <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                    {formatMoneyBRL(r.serviceRevenue)}
                  </td>
                  <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                    {formatMoneyBRL(r.standaloneRevenue)}
                  </td>
                  <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                    {formatMoneyBRL(r.totalCommission)}
                  </td>
                  <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                    {formatMoneyBRL(r.grossProfit)}
                  </td>
                  <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                    {r.doneCount}
                  </td>
                  <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                    {formatMoneyBRL(r.ticket)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Por profissional */}
      <section className="rounded-xl border border-border-primary bg-background-tertiary p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-label-large text-content-primary">
              Receita, comissão e margem por profissional
            </p>
          </div>
        </div>

        {barberRows.length === 0 ? (
          <div
            className={cn(
              "mt-4 h-28 w-full rounded-lg border border-border-primary",
              "bg-background-secondary",
              "flex items-center justify-center",
              "text-content-tertiary text-sm",
            )}
          >
            Sem dados para o período.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-border-primary text-content-secondary">
                  <th className="py-2 pr-3">Profissional</th>
                  <th className="py-2 pr-3 text-right">Receita</th>
                  <th className="py-2 pr-3 text-right">Serviços</th>
                  <th className="py-2 pr-3 text-right">Produtos</th>
                  <th className="py-2 pr-3 text-right">Comissão</th>
                  <th className="py-2 pr-3 text-right">Margem</th>
                  <th className="py-2 pr-3 text-right">Atend.</th>
                  <th className="py-2 pr-3 text-right">Ticket</th>
                </tr>
              </thead>
              <tbody>
                {barberRows.map((r) => (
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
                      {formatMoneyBRL(r.totalRevenue)}
                    </td>
                    <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                      {formatMoneyBRL(r.serviceRevenue)}
                    </td>
                    <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                      {formatMoneyBRL(r.productRevenue)}
                    </td>
                    <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                      {formatMoneyBRL(r.totalCommission)}
                    </td>
                    <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                      {formatMoneyBRL(r.grossProfit)}
                    </td>
                    <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                      {r.doneCount}
                    </td>
                    <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                      {formatMoneyBRL(r.ticket)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Por serviço */}
      <section className="rounded-xl border border-border-primary bg-background-tertiary p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-label-large text-content-primary">
              Receita e comissão por serviço
            </p>
          </div>
        </div>

        {serviceRows.length === 0 ? (
          <div
            className={cn(
              "mt-4 h-28 w-full rounded-lg border border-border-primary",
              "bg-background-secondary",
              "flex items-center justify-center",
              "text-content-tertiary text-sm",
            )}
          >
            Sem dados para o período.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-border-primary text-content-secondary">
                  <th className="py-2 pr-3">Serviço</th>
                  <th className="py-2 pr-3 text-right">Receita</th>
                  <th className="py-2 pr-3 text-right">Comissão</th>
                  <th className="py-2 pr-3 text-right">Qtd</th>
                  <th className="py-2 pr-3 text-right">Ticket</th>
                </tr>
              </thead>
              <tbody>
                {serviceRows.map((r) => (
                  <tr
                    key={r.service}
                    className="border-b border-border-primary/60 last:border-0"
                  >
                    <td className="py-2 pr-3 text-content-primary font-medium">
                      {r.service}
                    </td>
                    <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                      {formatMoneyBRL(r.revenue)}
                    </td>
                    <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                      {formatMoneyBRL(r.commission)}
                    </td>
                    <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                      {r.count}
                    </td>
                    <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                      {formatMoneyBRL(r.ticket)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Produtos */}
      <section className="rounded-xl border border-border-primary bg-background-tertiary p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-label-large text-content-primary">
              Produtos (vendas finalizadas)
            </p>
          </div>
        </div>

        {productRows.length === 0 ? (
          <div
            className={cn(
              "mt-4 h-28 w-full rounded-lg border border-border-primary",
              "bg-background-secondary",
              "flex items-center justify-center",
              "text-content-tertiary text-sm",
            )}
          >
            Sem vendas de produto no período.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-border-primary text-content-secondary">
                  <th className="py-2 pr-3">Produto</th>
                  <th className="py-2 pr-3 text-right">Receita</th>
                  <th className="py-2 pr-3 text-right">Comissão</th>
                  <th className="py-2 pr-3 text-right">Vendas</th>
                </tr>
              </thead>
              <tbody>
                {productRows.map((r) => (
                  <tr
                    key={r.product}
                    className="border-b border-border-primary/60 last:border-0"
                  >
                    <td className="py-2 pr-3 text-content-primary font-medium">
                      {r.product}
                    </td>
                    <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                      {formatMoneyBRL(r.revenue)}
                    </td>
                    <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                      {formatMoneyBRL(r.commission)}
                    </td>
                    <td className="py-2 pr-3 text-content-primary text-right tabular-nums">
                      {r.salesCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
