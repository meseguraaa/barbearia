// app/admin/dashboard/page.tsx
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import type { Metadata } from "next";

import { DatePicker } from "@/components/date-picker";
import { DashboardDailySummary } from "@/components/dashboard-daily-summary";
import { DashboardMonthlySummary } from "@/components/dashboard-monthly-summary";

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

async function getAppointments(dateParam?: string) {
  let baseDate: Date;

  if (dateParam) {
    const parsed = parseDateParam(dateParam);
    baseDate = parsed ?? getSaoPauloToday();
  } else {
    baseDate = getSaoPauloToday();
  }

  const start = startOfDay(baseDate);
  const end = endOfDay(baseDate);

  const appointments = await prisma.appointment.findMany({
    where: {
      scheduleAt: {
        gte: start,
        lte: end,
      },
    },
    orderBy: {
      scheduleAt: "asc",
    },
    include: {
      service: true,
    },
  });

  return appointments;
}

export default async function AdminDashboardPage({
  searchParams,
}: AdminDashboardPageProps) {
  const resolvedSearchParams = await searchParams;
  const dateParam = resolvedSearchParams.date;

  const todaySP = getSaoPauloToday();

  const selectedDate = dateParam
    ? (parseDateParam(dateParam) ?? todaySP)
    : todaySP;

  const dayStart = startOfDay(selectedDate);
  const dayEnd = endOfDay(selectedDate);

  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);

  const [
    appointmentsPrisma,
    monthAppointmentsPrisma,
    monthCanceledAppointmentsPrisma,
    monthExpensesPrisma,
    dayProductSalesPrisma,
    monthProductSalesPrisma,
  ] = await Promise.all([
    getAppointments(dateParam),
    prisma.appointment.findMany({
      where: {
        status: "DONE",
        scheduleAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      include: {
        service: true,
      },
    }),
    prisma.appointment.findMany({
      where: {
        status: "CANCELED",
        scheduleAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
    }),
    prisma.expense.findMany({
      where: {
        dueDate: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
    }),
    prisma.productSale.findMany({
      where: {
        soldAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      include: {
        product: true,
        barber: true,
      },
    }),
    prisma.productSale.findMany({
      where: {
        soldAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      include: {
        product: true,
        barber: true,
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

  // 🔹 Taxas de cancelamento do dia
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

  // 🔹 GERAL DO DIA (SERVIÇOS + PRODUTOS)
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

  // 🔹 Taxas de cancelamento do mês
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

  // 🔹 GERAL DO MÊS (SERVIÇOS + PRODUTOS)
  const totalGrossMonth = totalGrossMonthServices + totalProductsRevenueMonth;
  const totalCommissionMonth =
    totalCommissionMonthServices + totalProductsCommissionMonth;
  const totalNetMonth = totalNetMonthServices + totalProductsNetMonth;

  // ====== DESPESAS DO MÊS (Financeiro) ======
  const totalExpensesMonth = monthExpensesPrisma.reduce((acc, expense) => {
    return acc + Number(expense.amount);
  }, 0);

  // 🔹 Lucro real: líquido do mês (serviços + produtos) - despesas
  const realNetMonth = totalNetMonth - totalExpensesMonth;

  return (
    <div className="space-y-6">
      {/* HEADER + DATA */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-title text-content-primary">Dashboard</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Visão geral de todos os agendamentos, serviços e vendas de produtos.
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

      {/* RESUMO FINANCEIRO DO MÊS + ATENDIMENTOS */}
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
      />
    </div>
  );
}
