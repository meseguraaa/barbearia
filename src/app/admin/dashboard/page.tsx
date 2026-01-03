// app/admin/dashboard/page.tsx
import { prisma } from "@/lib/prisma";
import { subMonths, getDaysInMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Metadata } from "next";
import { cookies } from "next/headers";

import { DatePicker } from "@/components/date-picker";
import { DashboardDailySummary } from "@/components/dashboard-daily-summary";
import { DashboardMonthlySummary } from "@/components/dashboard-monthly-summary";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { DashboardRevenueChart } from "@/components/dashboard-charts/dashboard-revenue-chart";
import { DashboardRatingsDistributionChart } from "@/components/dashboard-charts/dashboard-ratings-distribution-chart";
import { DashboardProductsVsServicesChart } from "@/components/dashboard-charts/dashboard-products-vs-services-chart";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Dashboard",
};

type AdminDashboardPageProps = {
  searchParams: Promise<{
    date?: string;
  }>;
};

const SAO_PAULO_TIMEZONE = "America/Sao_Paulo";
const UNIT_COOKIE_NAME = "admin_unit_context";
const UNIT_ALL_VALUE = "all";

function getSaoPauloToday(): Date {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(now);
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "1");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "1970");

  return new Date(year, month - 1, day);
}

function parseDateParam(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

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
function startOfDaySP(date: Date): Date {
  const { y, m, d } = getSaoPauloYMD(date);
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
}

function endOfDaySP(date: Date): Date {
  const start = startOfDaySP(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

function startOfMonthSP(date: Date): Date {
  const { y, m } = getSaoPauloYMD(date);
  return new Date(Date.UTC(y, m - 1, 1, 3, 0, 0));
}

function endOfMonthSP(date: Date): Date {
  const { y, m } = getSaoPauloYMD(date);
  const nextMonth = new Date(Date.UTC(y, m, 1, 3, 0, 0));
  return new Date(nextMonth.getTime() - 1);
}

/* =========================================================
 * Multi-tenant + Multi-unidade: helpers de contexto + where
 * ========================================================= */

type AdminContext = {
  id: string;
  companyId: string;

  unitId?: string | null;
  canSeeAllUnits?: boolean | null;
  isOwner?: boolean | null;
};

async function normalizeAdminContext(admin: any): Promise<AdminContext> {
  const ctx: AdminContext = {
    id: String(admin?.id ?? ""),
    companyId: String(admin?.companyId ?? ""),

    unitId: (admin?.unitId ?? null) as string | null,
    canSeeAllUnits:
      typeof admin?.canSeeAllUnits === "boolean" ? admin.canSeeAllUnits : null,
    isOwner: typeof admin?.isOwner === "boolean" ? admin.isOwner : null,
  };

  // companyId é obrigatório no painel multi-tenant
  if (!ctx.id || !ctx.companyId) return ctx;

  const needsDb =
    ctx.unitId == null || ctx.canSeeAllUnits == null || ctx.isOwner == null;

  if (!needsDb) return ctx;

  // 🔒 NUNCA buscar companyId no User (não existe no schema)
  // Busca apenas o que falta via CompanyMember + AdminAccess (scopado por companyId).
  const [membership, access] = await Promise.all([
    prisma.companyMember.findFirst({
      where: {
        userId: ctx.id,
        companyId: ctx.companyId,
        isActive: true,
      } as any,
      select: { role: true },
    }),
    prisma.adminAccess.findFirst({
      where: { userId: ctx.id, companyId: ctx.companyId } as any,
      select: { unitId: true as any },
    }),
  ]);

  const dbIsOwner = String(membership?.role ?? "") === "OWNER";
  const dbUnitId = (access as any)?.unitId ?? null;

  return {
    id: ctx.id,
    companyId: ctx.companyId,
    isOwner: ctx.isOwner ?? dbIsOwner,
    unitId: ctx.unitId ?? dbUnitId,
    canSeeAllUnits: ctx.canSeeAllUnits ?? ctx.isOwner ?? dbIsOwner ?? false,
  };
}

async function resolveUnitScope(admin: {
  unitId: string | null;
  canSeeAllUnits: boolean;
}) {
  if (!admin.canSeeAllUnits) {
    return admin.unitId;
  }

  const cookieStore = await cookies();
  const cookieValue =
    cookieStore.get(UNIT_COOKIE_NAME)?.value ?? UNIT_ALL_VALUE;

  if (!cookieValue || cookieValue === UNIT_ALL_VALUE) return null;
  return cookieValue;
}

function whereCompany(companyId: string) {
  return { companyId } as any;
}

function whereAppointmentScope(companyId: string, unitId: string | null) {
  return {
    ...whereCompany(companyId),
    ...(unitId ? { unitId } : {}),
  } as any;
}

// AppointmentReview não tem unitId: filtra via appointment.unitId e appointment.companyId.
function whereReviewScope(companyId: string, unitId: string | null) {
  return {
    appointment: {
      companyId,
      ...(unitId ? { unitId } : {}),
    },
  } as any;
}

function whereProductSaleScope(companyId: string, unitId: string | null) {
  return {
    ...whereCompany(companyId),
    ...(unitId ? { unitId } : {}),
  } as any;
}

function whereExpenseScope(companyId: string, unitId: string | null) {
  return {
    ...whereCompany(companyId),
    ...(unitId ? { unitId } : {}),
  } as any;
}

function whereOrderScope(companyId: string, unitId: string | null) {
  return {
    ...whereCompany(companyId),
    ...(unitId ? { unitId } : {}),
  } as any;
}

function whereProductScope(companyId: string, unitId: string | null) {
  return {
    ...whereCompany(companyId),
    ...(unitId ? { unitId } : {}),
  } as any;
}

async function getAppointments(
  dateParam: string | undefined,
  companyId: string,
  unitId: string | null,
) {
  let baseDate: Date;

  if (dateParam) {
    const parsed = parseDateParam(dateParam);
    baseDate = parsed ?? getSaoPauloToday();
  } else {
    baseDate = getSaoPauloToday();
  }

  const start = startOfDaySP(baseDate);
  const end = endOfDaySP(baseDate);

  const appointments = await prisma.appointment.findMany({
    where: {
      scheduleAt: { gte: start, lte: end },
      ...whereAppointmentScope(companyId, unitId),
    } as any,
    orderBy: { scheduleAt: "asc" },
    include: { service: true },
  });

  return appointments;
}

export default async function AdminDashboardPage({
  searchParams,
}: AdminDashboardPageProps) {
  // 🔐 Permissão
  const rawAdmin = await requireAdminPermission("canAccessDashboard");
  const admin = await normalizeAdminContext(rawAdmin);

  // ✅ Multi-tenant hard stop (nada existe sem companyId)
  const companyId = admin.companyId;
  if (!companyId) {
    throw new Error(
      "Admin sem companyId definido. Este painel é multi-tenant: vincule o admin a uma empresa (companyId).",
    );
  }

  if (!admin.canSeeAllUnits && !admin.unitId) {
    throw new Error(
      "Admin de unidade sem unitId definido. Vincule este admin a uma unidade.",
    );
  }

  // ✅ Escopo final de unidade (por cima do company)
  const activeUnitId = await resolveUnitScope({
    unitId: admin.unitId ?? null,
    canSeeAllUnits: !!admin.canSeeAllUnits,
  });

  const resolvedSearchParams = await searchParams;
  const dateParam = resolvedSearchParams.date;

  const todaySP = getSaoPauloToday();
  const selectedDate = dateParam
    ? (parseDateParam(dateParam) ?? todaySP)
    : todaySP;

  const dayStart = startOfDaySP(selectedDate);
  const dayEnd = endOfDaySP(selectedDate);

  const monthStart = startOfMonthSP(selectedDate);
  const monthEnd = endOfMonthSP(selectedDate);

  const previousMonthDate = subMonths(selectedDate, 1);
  const previousMonthStart = startOfMonthSP(previousMonthDate);
  const previousMonthEnd = endOfMonthSP(previousMonthDate);

  const [
    appointmentsPrisma,
    monthAppointmentsPrisma,
    monthCanceledAppointmentsPrisma,
    monthExpensesPrisma,
    dayProductSalesPrisma,
    monthProductSalesPrisma,
    allReviewsPrisma,
    allReviewsOverallPrisma,
    previousMonthAppointmentsPrisma,
    previousMonthProductSalesPrisma,
    monthOrdersPrisma,

    // ✅ NOVOS: estoque e reservas
    productsStockAggPrisma,
    reservedOrdersPrisma,
  ] = await Promise.all([
    getAppointments(dateParam, companyId, activeUnitId),

    prisma.appointment.findMany({
      where: {
        status: "DONE",
        scheduleAt: { gte: monthStart, lte: monthEnd },
        ...whereAppointmentScope(companyId, activeUnitId),
      } as any,
      include: { service: true },
    }),

    prisma.appointment.findMany({
      where: {
        status: "CANCELED",
        scheduleAt: { gte: monthStart, lte: monthEnd },
        ...whereAppointmentScope(companyId, activeUnitId),
      } as any,
    }),

    prisma.expense.findMany({
      where: {
        dueDate: { gte: monthStart, lte: monthEnd },
        ...whereExpenseScope(companyId, activeUnitId),
      } as any,
    }),

    prisma.productSale.findMany({
      where: {
        soldAt: { gte: dayStart, lte: dayEnd },
        ...whereProductSaleScope(companyId, activeUnitId),
      } as any,
      include: {
        product: true,
        barber: true,
      },
    }),

    prisma.productSale.findMany({
      where: {
        soldAt: { gte: monthStart, lte: monthEnd },
        ...whereProductSaleScope(companyId, activeUnitId),
      } as any,
      include: {
        product: true,
        barber: true,
      },
    }),

    prisma.appointmentReview.findMany({
      where: {
        createdAt: { gte: monthStart, lte: monthEnd },
        ...whereReviewScope(companyId, activeUnitId),
      } as any,
      include: {
        barber: true,
        client: true,
        appointment: {
          include: {
            service: true,
          },
        },
        tags: {
          include: {
            tag: true,
          },
        },
      },
    }),

    prisma.appointmentReview.findMany({
      where: {
        ...whereReviewScope(companyId, activeUnitId),
      } as any,
      select: { rating: true },
    }),

    prisma.appointment.findMany({
      where: {
        status: "DONE",
        scheduleAt: { gte: previousMonthStart, lte: previousMonthEnd },
        ...whereAppointmentScope(companyId, activeUnitId),
      } as any,
      include: { service: true },
    }),

    prisma.productSale.findMany({
      where: {
        soldAt: { gte: previousMonthStart, lte: previousMonthEnd },
        ...whereProductSaleScope(companyId, activeUnitId),
      } as any,
      include: {
        product: true,
        barber: true,
      },
    }),

    prisma.order.findMany({
      where: {
        status: "COMPLETED",
        createdAt: { gte: monthStart, lte: monthEnd },
        ...whereOrderScope(companyId, activeUnitId),
      } as any,
      include: {
        items: true,
      },
    }),

    // ✅ Estoque total (AGORA), respeitando company + filtro de unidade
    prisma.product.aggregate({
      where: {
        ...whereProductScope(companyId, activeUnitId),
      } as any,
      _sum: {
        stockQuantity: true as any,
      },
    }),

    // ✅ Reservas do mês (quantidade de produtos em pedidos “RESERVED”)
    prisma.order.findMany({
      where: {
        createdAt: { gte: monthStart, lte: monthEnd },
        ...whereOrderScope(companyId, activeUnitId),
      } as any,
      select: {
        status: true,
        items: true,
      },
    }),
  ]);

  // ====== FORMATADOR DE MOEDA ======
  const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

  // ================================
  // FINANCEIRO DE SERVIÇO (DIA)
  // ================================
  const doneAppointments = appointmentsPrisma.filter(
    (appt) => appt.status === "DONE",
  );

  const {
    totalGrossDay: totalGrossDayServices,
    totalCommissionDay: totalCommissionDayServices,
    totalNetDay: totalNetDayServices,
  } = doneAppointments.reduce(
    (acc, appt) => {
      const priceSnapshot = appt.servicePriceAtTheTime;
      const priceService = appt.service?.price ?? 0;
      const priceNumber = priceSnapshot
        ? Number(priceSnapshot)
        : Number(priceService);

      const percentSnapshot = appt.barberPercentageAtTheTime;
      const percentService = appt.service?.barberPercentage ?? 0;
      const percentNumber = percentSnapshot
        ? Number(percentSnapshot)
        : Number(percentService);

      const earningSnapshot = appt.barberEarningValue;
      const earningNumber = earningSnapshot
        ? Number(earningSnapshot)
        : (priceNumber * percentNumber) / 100;

      acc.totalGrossDay += priceNumber;
      acc.totalCommissionDay += earningNumber;
      acc.totalNetDay += priceNumber - earningNumber;

      return acc;
    },
    {
      totalGrossDay: 0,
      totalCommissionDay: 0,
      totalNetDay: 0,
    },
  );

  const totalAppointmentsDoneDay = doneAppointments.length;

  const canceledAppointmentsDay = appointmentsPrisma.filter(
    (appt) => appt.status === "CANCELED",
  );
  const totalAppointmentsCanceledDay = canceledAppointmentsDay.length;

  const canceledWithFeeDay = canceledAppointmentsDay.filter(
    (appt) => appt.cancelFeeApplied,
  );

  const totalCancelFeeDay = canceledWithFeeDay.reduce((acc, appt) => {
    const fee = appt.cancelFeeValue ? Number(appt.cancelFeeValue) : 0;
    return acc + fee;
  }, 0);

  const totalCanceledWithFeeDay = canceledWithFeeDay.length;

  // ================================
  // FINANCEIRO DE PRODUTO (DIA)
  // ================================
  const totalProductsRevenueDay = dayProductSalesPrisma.reduce(
    (acc, sale) => acc + Number(sale.totalPrice),
    0,
  );

  const totalProductsCommissionDay = dayProductSalesPrisma.reduce(
    (acc, sale) => {
      const percent = sale.product?.barberPercentage ?? 0;
      return acc + (Number(sale.totalPrice) * percent) / 100;
    },
    0,
  );

  const totalProductsNetDay =
    totalProductsRevenueDay - totalProductsCommissionDay;

  const totalProductsSoldDay = dayProductSalesPrisma.reduce(
    (acc, sale) => acc + sale.quantity,
    0,
  );

  // 🔹 GERAL DO DIA
  const totalGrossDay = totalGrossDayServices + totalProductsRevenueDay;
  const totalCommissionDay =
    totalCommissionDayServices + totalProductsCommissionDay;
  const totalNetDay = totalNetDayServices + totalProductsNetDay;

  // ================================
  // FINANCEIRO DE SERVIÇO (MÊS)
  // ================================
  const {
    totalGrossMonth: totalGrossMonthServices,
    totalCommissionMonth: totalCommissionMonthServices,
    totalNetMonth: totalNetMonthServices,
  } = monthAppointmentsPrisma.reduce(
    (acc, appt) => {
      const priceSnapshot = appt.servicePriceAtTheTime;
      const priceService = appt.service?.price ?? 0;
      const priceNumber = priceSnapshot
        ? Number(priceSnapshot)
        : Number(priceService);

      const percentSnapshot = appt.barberPercentageAtTheTime;
      const percentService = appt.service?.barberPercentage ?? 0;
      const percentNumber = percentSnapshot
        ? Number(percentSnapshot)
        : Number(percentService);

      const earningSnapshot = appt.barberEarningValue;
      const earningNumber = earningSnapshot
        ? Number(earningSnapshot)
        : (priceNumber * percentNumber) / 100;

      acc.totalGrossMonth += priceNumber;
      acc.totalCommissionMonth += earningNumber;
      acc.totalNetMonth += priceNumber - earningNumber;

      return acc;
    },
    {
      totalGrossMonth: 0,
      totalCommissionMonth: 0,
      totalNetMonth: 0,
    },
  );

  const totalAppointmentsDoneMonth = monthAppointmentsPrisma.length;
  const totalAppointmentsCanceledMonth = monthCanceledAppointmentsPrisma.length;

  const canceledWithFeeMonth = monthCanceledAppointmentsPrisma.filter(
    (appt) => appt.cancelFeeApplied,
  );

  const totalCancelFeeMonth = canceledWithFeeMonth.reduce((acc, appt) => {
    const fee = appt.cancelFeeValue ? Number(appt.cancelFeeValue) : 0;
    return acc + fee;
  }, 0);

  const totalCanceledWithFeeMonth = canceledWithFeeMonth.length;

  // ================================
  // FINANCEIRO DE PRODUTO (MÊS)
  // ================================
  const totalProductsRevenueMonth = monthProductSalesPrisma.reduce(
    (acc, sale) => acc + Number(sale.totalPrice),
    0,
  );

  const totalProductsCommissionMonth = monthProductSalesPrisma.reduce(
    (acc, sale) => {
      const percent = sale.product?.barberPercentage ?? 0;
      return acc + (Number(sale.totalPrice) * percent) / 100;
    },
    0,
  );

  const totalProductsNetMonth =
    totalProductsRevenueMonth - totalProductsCommissionMonth;

  const totalProductsSoldMonth = monthProductSalesPrisma.reduce(
    (acc, sale) => acc + sale.quantity,
    0,
  );

  // ================================
  // ✅ PRODUTOS (CARD NOVO)
  // ================================
  const totalProductsInStock = Number(
    (productsStockAggPrisma as any)?._sum?.stockQuantity ?? 0,
  );

  const totalProductsReservedMonth = (reservedOrdersPrisma ?? []).reduce(
    (acc, order) => {
      // ✅ Reserva = pendente (não concluído e não cancelado)
      if (order.status === "COMPLETED") return acc;
      if (order.status === "CANCELED") return acc;

      const items = (order as any)?.items ?? [];
      const productItems = items.filter((it: any) => !!it.productId);

      const qty = productItems.reduce((a: number, it: any) => {
        const q = typeof it.quantity === "number" ? it.quantity : 1;
        return a + q;
      }, 0);

      return acc + qty;
    },
    0,
  );

  // 🔹 GERAL DO MÊS
  const totalGrossMonth = totalGrossMonthServices + totalProductsRevenueMonth;
  const totalCommissionMonth =
    totalCommissionMonthServices + totalProductsCommissionMonth;
  const totalNetMonth = totalNetMonthServices + totalProductsNetMonth;

  // ====== DESPESAS DO MÊS ======
  const totalExpensesMonth = monthExpensesPrisma.reduce((acc, expense) => {
    return acc + Number(expense.amount);
  }, 0);

  const realNetMonth = totalNetMonth - totalExpensesMonth;

  // ================================
  // AVALIAÇÕES (MÊS + HISTÓRICO)
  // ================================
  const totalReviewsMonth = allReviewsPrisma.length;

  const averageRatingMonth =
    totalReviewsMonth > 0
      ? allReviewsPrisma.reduce((acc, review) => acc + review.rating, 0) /
        totalReviewsMonth
      : 0;

  const totalReviewsOverall = allReviewsOverallPrisma.length;

  const averageRatingOverall =
    totalReviewsOverall > 0
      ? allReviewsOverallPrisma.reduce((acc, r) => acc + r.rating, 0) /
        totalReviewsOverall
      : 0;

  const averageRatingMonthDisplay =
    totalReviewsMonth > 0 ? averageRatingMonth.toFixed(2) : "—";

  const averageRatingOverallDisplay =
    totalReviewsOverall > 0 ? averageRatingOverall.toFixed(2) : "—";

  type BarberReviewStats = {
    barberId: string;
    barberName: string;
    totalReviews: number;
    avgRating: number;
  };

  const barberReviewsMap = new Map<string, BarberReviewStats>();

  for (const review of allReviewsPrisma) {
    if (!review.barberId || !review.barber) continue;

    const existing = barberReviewsMap.get(review.barberId);

    if (!existing) {
      barberReviewsMap.set(review.barberId, {
        barberId: review.barberId,
        barberName: review.barber.name,
        totalReviews: 1,
        avgRating: review.rating,
      });
    } else {
      const newTotalReviews = existing.totalReviews + 1;
      const newAvg =
        (existing.avgRating * existing.totalReviews + review.rating) /
        newTotalReviews;

      barberReviewsMap.set(review.barberId, {
        ...existing,
        totalReviews: newTotalReviews,
        avgRating: newAvg,
      });
    }
  }

  const barberReviewsRanking = Array.from(barberReviewsMap.values()).sort(
    (a, b) => {
      if (b.avgRating !== a.avgRating) return b.avgRating - a.avgRating;
      if (b.totalReviews !== a.totalReviews)
        return b.totalReviews - a.totalReviews;
      return a.barberName.localeCompare(b.barberName);
    },
  );

  // 🔹 Tags positivas x negativas
  const positiveTagMap = new Map<string, number>();
  const negativeTagMap = new Map<string, number>();

  for (const review of allReviewsPrisma) {
    const isPositive = review.rating >= 3;
    const isNegative = review.rating <= 2;

    for (const rt of review.tags ?? []) {
      const label = rt.tag.label;
      if (isPositive)
        positiveTagMap.set(label, (positiveTagMap.get(label) ?? 0) + 1);
      if (isNegative)
        negativeTagMap.set(label, (negativeTagMap.get(label) ?? 0) + 1);
    }
  }

  const topPositiveTags = Array.from(positiveTagMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) =>
      b.count !== a.count ? b.count - a.count : a.label.localeCompare(b.label),
    )
    .slice(0, 8);

  const topNegativeTags = Array.from(negativeTagMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) =>
      b.count !== a.count ? b.count - a.count : a.label.localeCompare(b.label),
    )
    .slice(0, 8);

  const positiveReviews = allReviewsPrisma.filter((r) => r.rating >= 3);
  const negativeReviews = allReviewsPrisma.filter((r) => r.rating <= 2);

  const recentPositiveReviews = [...positiveReviews]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5);

  const recentNegativeReviews = [...negativeReviews]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5);

  const ratingBuckets = [0, 0, 0, 0, 0];
  for (const review of allReviewsPrisma) {
    const r = review.rating;
    if (r >= 1 && r <= 5) ratingBuckets[r - 1] += 1;
  }

  const ratingsDistributionData = ratingBuckets.map((count, index) => ({
    rating: index + 1,
    count,
  }));

  // ================================
  // GRÁFICO FATURAMENTO (MÊS ATUAL VS ANTERIOR)
  // ================================
  const currentMonthRevenueByDay = new Map<number, number>();
  const previousMonthRevenueByDay = new Map<number, number>();

  for (const appt of monthAppointmentsPrisma) {
    const day = appt.scheduleAt.getDate();
    const priceSnapshot = appt.servicePriceAtTheTime;
    const priceService = appt.service?.price ?? 0;
    const priceNumber = priceSnapshot
      ? Number(priceSnapshot)
      : Number(priceService);

    currentMonthRevenueByDay.set(
      day,
      (currentMonthRevenueByDay.get(day) ?? 0) + priceNumber,
    );
  }

  for (const sale of monthProductSalesPrisma) {
    const day = sale.soldAt.getDate();
    const total = Number(sale.totalPrice);
    currentMonthRevenueByDay.set(
      day,
      (currentMonthRevenueByDay.get(day) ?? 0) + total,
    );
  }

  let previousMonthTotalGross = 0;

  for (const appt of previousMonthAppointmentsPrisma) {
    const day = appt.scheduleAt.getDate();
    const priceSnapshot = appt.servicePriceAtTheTime;
    const priceService = appt.service?.price ?? 0;
    const priceNumber = priceSnapshot
      ? Number(priceSnapshot)
      : Number(priceService);

    previousMonthRevenueByDay.set(
      day,
      (previousMonthRevenueByDay.get(day) ?? 0) + priceNumber,
    );
    previousMonthTotalGross += priceNumber;
  }

  for (const sale of previousMonthProductSalesPrisma) {
    const day = sale.soldAt.getDate();
    const total = Number(sale.totalPrice);

    previousMonthRevenueByDay.set(
      day,
      (previousMonthRevenueByDay.get(day) ?? 0) + total,
    );
    previousMonthTotalGross += total;
  }

  const maxDays = Math.max(
    getDaysInMonth(selectedDate),
    getDaysInMonth(previousMonthDate),
  );

  const revenueChartData = Array.from({ length: maxDays }, (_, index) => {
    const day = index + 1;
    return {
      day,
      currentMonth: currentMonthRevenueByDay.get(day) ?? 0,
      previousMonth: previousMonthRevenueByDay.get(day) ?? 0,
    };
  });

  const variationPercentage =
    previousMonthTotalGross > 0
      ? ((totalGrossMonth - previousMonthTotalGross) /
          previousMonthTotalGross) *
        100
      : null;

  const currentMonthLabel = format(selectedDate, "MMM/yyyy", { locale: ptBR });
  const previousMonthLabel = format(previousMonthDate, "MMM/yyyy", {
    locale: ptBR,
  });

  // ================================
  // GRÁFICO 5 · PRODUTOS x SERVIÇOS (ORDERS)
  // ================================
  const daysInMonth = getDaysInMonth(selectedDate);

  type ProductsVsServicesBucket = {
    services: number;
    products: number;
  };

  const revenueByDayFromOrders = new Map<number, ProductsVsServicesBucket>();

  let totalOrdersServicesMonth = 0;
  let totalOrdersProductsMonth = 0;

  for (const order of monthOrdersPrisma) {
    const day = order.createdAt.getDate();

    const bucket: ProductsVsServicesBucket = revenueByDayFromOrders.get(
      day,
    ) ?? {
      services: 0,
      products: 0,
    };

    for (const item of order.items ?? []) {
      const total = item.totalPrice ? Number(item.totalPrice) : 0;

      if (item.serviceId) {
        bucket.services += total;
        totalOrdersServicesMonth += total;
      } else if (item.productId) {
        bucket.products += total;
        totalOrdersProductsMonth += total;
      }
    }

    revenueByDayFromOrders.set(day, bucket);
  }

  const productsVsServicesChartData = Array.from(
    { length: daysInMonth },
    (_, index) => {
      const day = index + 1;
      const bucket = revenueByDayFromOrders.get(day) ?? {
        services: 0,
        products: 0,
      };

      return {
        day,
        label: String(day).padStart(2, "0"),
        services: bucket.services,
        products: bucket.products,
      };
    },
  );

  return (
    <div className="space-y-6">
      {/* HEADER + DATA */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-title text-content-primary">Dashboard</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Visão geral de todos os agendamentos, serviços, vendas de produtos e
            satisfação dos clientes.
          </p>
        </div>

        <DatePicker />
      </div>

      {/* RESUMO FINANCEIRO DO DIA (SERVIÇOS + PRODUTOS) */}
      <DashboardDailySummary
        totalGrossDay={currencyFormatter.format(totalGrossDay)}
        totalGrossDayServices={currencyFormatter.format(totalGrossDayServices)}
        totalGrossDayProducts={currencyFormatter.format(
          totalProductsRevenueDay,
        )}
        totalCommissionDay={currencyFormatter.format(totalCommissionDay)}
        totalCommissionDayServices={currencyFormatter.format(
          totalCommissionDayServices,
        )}
        totalCommissionDayProducts={currencyFormatter.format(
          totalProductsCommissionDay,
        )}
        totalNetDay={currencyFormatter.format(totalNetDay)}
        totalNetDayServices={currencyFormatter.format(totalNetDayServices)}
        totalNetDayProducts={currencyFormatter.format(totalProductsNetDay)}
        totalCancelFeeDay={currencyFormatter.format(totalCancelFeeDay)}
        totalCanceledWithFeeDay={totalCanceledWithFeeDay}
      />

      {/* RESUMO FINANCEIRO DO MÊS + ATENDIMENTOS + (NOVO) PRODUTOS */}
      <DashboardMonthlySummary
        totalGrossMonth={currencyFormatter.format(totalGrossMonth)}
        totalGrossMonthServices={currencyFormatter.format(
          totalGrossMonthServices,
        )}
        totalGrossMonthProducts={currencyFormatter.format(
          totalProductsRevenueMonth,
        )}
        totalNetMonth={currencyFormatter.format(totalNetMonth)}
        totalNetMonthServices={currencyFormatter.format(totalNetMonthServices)}
        totalNetMonthProducts={currencyFormatter.format(totalProductsNetMonth)}
        totalExpensesMonth={currencyFormatter.format(totalExpensesMonth)}
        realNetMonth={currencyFormatter.format(realNetMonth)}
        realNetMonthIsPositive={realNetMonth >= 0}
        totalAppointmentsDoneDay={totalAppointmentsDoneDay}
        totalAppointmentsDoneMonth={totalAppointmentsDoneMonth}
        totalAppointmentsCanceledDay={totalAppointmentsCanceledDay}
        totalAppointmentsCanceledMonth={totalAppointmentsCanceledMonth}
        totalCanceledWithFeeDay={totalCanceledWithFeeDay}
        totalCanceledWithFeeMonth={totalCanceledWithFeeMonth}
        // ✅ NOVOS (para a caixa Produtos ao lado de Atendimento)
        productsInStock={totalProductsInStock}
        productsSoldMonth={totalProductsSoldMonth}
        productsReservedMonth={totalProductsReservedMonth}
      />

      {/* GRÁFICO DE FATURAMENTO (MÊS ATUAL VS ANTERIOR) */}
      <DashboardRevenueChart
        data={revenueChartData}
        currentMonthLabel={currentMonthLabel}
        previousMonthLabel={previousMonthLabel}
        variationPercentage={variationPercentage ?? undefined}
      />

      {/* GRÁFICO 5 · PRODUTOS x SERVIÇOS (FATURAMENTO DO MÊS) */}
      <DashboardProductsVsServicesChart
        data={productsVsServicesChartData}
        monthLabel={currentMonthLabel}
        totalServices={totalOrdersServicesMonth}
        totalProducts={totalOrdersProductsMonth}
      />

      {/* AVALIAÇÕES DE CLIENTES */}
      <section className="space-y-4 rounded-xl border border-border-primary bg-background-tertiary p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-label-small text-content-secondary">
              Satisfação dos clientes (mês selecionado)
            </p>

            <p className="text-title font-semibold text-content-primary">
              Nota média no mês:{" "}
              <span className="font-semibold">{averageRatingMonthDisplay}</span>
              {totalReviewsMonth > 0 && (
                <span className="ml-2 align-middle text-xl text-yellow-500">
                  {"★".repeat(Math.round(averageRatingMonth))}
                </span>
              )}
            </p>

            <p className="text-paragraph-small text-content-secondary">
              Nota média geral (histórico):{" "}
              <span className="font-semibold text-content-primary">
                {averageRatingOverallDisplay}
              </span>{" "}
              {totalReviewsOverall > 0 && (
                <span className="text-content-tertiary">
                  ({totalReviewsOverall} avaliações)
                </span>
              )}
            </p>

            <p className="text-paragraph-small text-content-secondary">
              Total de avaliações no mês:{" "}
              <span className="font-semibold text-content-primary">
                {totalReviewsMonth}
              </span>
            </p>

            <p className="mt-1 text-paragraph-small text-content-tertiary">
              Algumas avaliações podem ter o nome do cliente oculto para o
              profissional, quando ele opta por avaliação anônima. Aqui no
              painel, o administrador sempre vê o cliente real.
            </p>
          </div>
        </div>

        {barberReviewsRanking.length === 0 ? (
          <p className="text-paragraph-small text-content-secondary">
            Ainda não há avaliações registradas neste mês.
          </p>
        ) : (
          <>
            {/* RANKING PROFISSIONAIS */}
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-paragraph-small">
                <thead>
                  <tr className="border-b border-border-primary text-content-secondary">
                    <th className="py-2 pr-4">#</th>
                    <th className="py-2 pr-4">Profissional</th>
                    <th className="py-2 pr-4">Nota média</th>
                    <th className="py-2 pr-4">Avaliações</th>
                  </tr>
                </thead>
                <tbody>
                  {barberReviewsRanking.map((row, index) => (
                    <tr
                      key={row.barberId}
                      className="border-b border-border-primary/60 last:border-0"
                    >
                      <td className="py-2 pr-4 text-content-secondary">
                        {index + 1}
                      </td>
                      <td className="py-2 pr-4 text-content-primary">
                        {row.barberName}
                      </td>
                      <td className="py-2 pr-4 text-content-primary">
                        {row.avgRating.toFixed(2)}
                      </td>
                      <td className="py-2 pr-4 text-content-secondary">
                        {row.totalReviews}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* MOTIVOS POSITIVOS / NEGATIVOS */}
            <div className="grid gap-4 border-t border-border-primary/60 pt-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-label-small text-content-primary">
                  Motivos positivos mais citados (no mês)
                </p>

                {topPositiveTags.length === 0 ? (
                  <p className="text-paragraph-small text-content-secondary">
                    Ainda não há tags positivas suficientes neste mês.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {topPositiveTags.map((tag) => (
                      <span
                        key={tag.label}
                        className="flex items-center gap-1 rounded-full border border-emerald-500/60 bg-emerald-500/5 px-3 py-1 text-[11px] text-emerald-500"
                      >
                        <span>{tag.label}</span>
                        <span className="text-emerald-500">· {tag.count}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-label-small text-content-primary">
                  Motivos negativos mais citados (no mês)
                </p>

                {topNegativeTags.length === 0 ? (
                  <p className="text-paragraph-small text-content-secondary">
                    Ainda não há feedbacks negativos suficientes neste mês. ✨
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {topNegativeTags.map((tag) => (
                      <span
                        key={tag.label}
                        className="flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/5 px-3 py-1 text-[11px] text-destructive"
                      >
                        <span>{tag.label}</span>
                        <span className="text-destructive">· {tag.count}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* FEEDBACKS RECENTES */}
            <div className="border-t border-border-primary/60 pt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-label-small text-content-primary">
                    Feedbacks positivos recentes (3–5 estrelas no mês)
                  </p>

                  {recentPositiveReviews.length === 0 ? (
                    <p className="text-paragraph-small text-content-secondary">
                      Nenhum feedback positivo registrado neste mês ainda.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {recentPositiveReviews.map((rev) => {
                        const clientName = rev.client?.name ?? "Cliente";
                        const barberName = rev.barber?.name ?? "Profissional";
                        const serviceName =
                          rev.appointment?.service?.name ?? "Atendimento";

                        return (
                          <div
                            key={rev.id}
                            className="space-y-1 rounded-xl border border-border-primary bg-background-secondary px-3 py-2 text-[11px]"
                          >
                            <p className="text-content-primary">
                              {clientName} ·{" "}
                              <span className="text-content-secondary">
                                {barberName} · {serviceName}
                              </span>{" "}
                              ·{" "}
                              <span className="text-yellow-500">
                                {rev.rating}★
                              </span>
                            </p>

                            {rev.tags.length > 0 && (
                              <p className="text-content-secondary">
                                Motivos:{" "}
                                {rev.tags.map((t) => t.tag.label).join(", ")}
                              </p>
                            )}

                            {rev.comment && (
                              <p className="text-content-secondary">
                                Comentário: {rev.comment}
                              </p>
                            )}

                            <p className="text-content-tertiary">
                              Registrado em:{" "}
                              {rev.createdAt.toLocaleString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-label-small text-content-primary">
                    Feedbacks negativos recentes (1–2 estrelas no mês)
                  </p>

                  {recentNegativeReviews.length === 0 ? (
                    <p className="text-paragraph-small text-content-secondary">
                      Nenhum feedback negativo registrado neste mês. 🧡
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {recentNegativeReviews.map((rev) => {
                        const clientName = rev.client?.name ?? "Cliente";
                        const barberName = rev.barber?.name ?? "Profissional";
                        const serviceName =
                          rev.appointment?.service?.name ?? "Atendimento";

                        return (
                          <div
                            key={rev.id}
                            className="space-y-1 rounded-xl border border-border-primary bg-background-secondary px-3 py-2 text-[11px]"
                          >
                            <p className="text-content-primary">
                              {clientName} ·{" "}
                              <span className="text-content-secondary">
                                {barberName} · {serviceName}
                              </span>{" "}
                              ·{" "}
                              <span className="text-yellow-500">
                                {rev.rating}★
                              </span>
                            </p>

                            {rev.tags.length > 0 && (
                              <p className="text-content-secondary">
                                Motivos:{" "}
                                {rev.tags.map((t) => t.tag.label).join(", ")}
                              </p>
                            )}

                            {rev.comment && (
                              <p className="text-content-secondary">
                                Comentário: {rev.comment}
                              </p>
                            )}

                            <p className="text-content-tertiary">
                              Registrado em:{" "}
                              {rev.createdAt.toLocaleString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {/* GRÁFICO 4 · SATISFAÇÃO */}
      <DashboardRatingsDistributionChart
        data={ratingsDistributionData}
        monthLabel={currentMonthLabel}
        averageRatingMonth={totalReviewsMonth > 0 ? averageRatingMonth : null}
        averageRatingOverall={
          totalReviewsOverall > 0 ? averageRatingOverall : null
        }
        totalReviewsMonth={totalReviewsMonth}
        totalReviewsOverall={totalReviewsOverall}
      />
    </div>
  );
}
