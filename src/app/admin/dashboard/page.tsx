// app/admin/dashboard/page.tsx
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import type { Metadata } from "next";
import { DatePicker } from "@/components/date-picker";

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
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-1">
          <p className="text-label-small text-content-secondary">
            Valor bruto (dia)
          </p>
          <p className="text-title text-content-primary">
            {currencyFormatter.format(totalGrossDay)}
          </p>
          <p className="text-label-small text-content-secondary">
            Serviços: {currencyFormatter.format(totalGrossDayServices)} •
            Produtos: {currencyFormatter.format(totalProductsRevenueDay)}
          </p>
        </div>

        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-1">
          <p className="text-label-small text-content-secondary">
            Comissão (dia)
          </p>
          <p className="text-title text-content-primary">
            {currencyFormatter.format(totalCommissionDay)}
          </p>
          <p className="text-label-small text-content-secondary">
            Serviços: {currencyFormatter.format(totalCommissionDayServices)} •
            Produtos: {currencyFormatter.format(totalProductsCommissionDay)}
          </p>
        </div>

        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-1">
          <p className="text-label-small text-content-secondary">
            Valor líquido (dia)
          </p>
          <p className="text-title text-content-primary">
            {currencyFormatter.format(totalNetDay)}
          </p>
          <p className="text-label-small text-content-secondary">
            Serviços: {currencyFormatter.format(totalNetDayServices)} •
            Produtos: {currencyFormatter.format(totalProductsNetDay)}
          </p>
        </div>

        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-1">
          <p className="text-label-small text-content_secondary">
            Taxas de cancelamento (dia)
          </p>
          <p className="text-title text-content-primary">
            {currencyFormatter.format(totalCancelFeeDay)}
          </p>
          <p className="text-label-small text-content-secondary">
            {totalCanceledWithFeeDay} cancelamento(s) com taxa
          </p>
        </div>
      </section>

      {/* RESUMO FINANCEIRO DO MÊS + ATENDIMENTOS + PRODUTOS */}
      <section className="grid gap-4 md:grid-cols-4">
        {/* 1. Bruto mês */}
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-1">
          <p className="text-label-small text-content-secondary">
            Valor bruto (mês)
          </p>
          <p className="text-title text-content-primary">
            {currencyFormatter.format(totalGrossMonth)}
          </p>
          <p className="text-label-small text-content-secondary">
            Serviços: {currencyFormatter.format(totalGrossMonthServices)} •
            Produtos: {currencyFormatter.format(totalProductsRevenueMonth)}
          </p>
        </div>

        {/* 2. Líquido mês (após comissão, SEM despesas fixas) */}
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-1">
          <p className="text-label-small text-content-secondary">
            Valor líquido (mês - sem despesas)
          </p>
          <p className="text-title text-content-primary">
            {currencyFormatter.format(totalNetMonth)}
          </p>
          <p className="text-paragraph-small text-content-secondary">
            Serviços: {currencyFormatter.format(totalNetMonthServices)} •
            Produtos: {currencyFormatter.format(totalProductsNetMonth)}
          </p>
        </div>

        {/* 3. Despesas do mês (Financeiro) */}
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-1">
          <p className="text-label-small text-content-secondary">
            Despesas (mês)
          </p>
          <p className="text-title text-content-primary">
            {currencyFormatter.format(totalExpensesMonth)}
          </p>
          <p className="text-paragraph-small text-content-secondary">
            Soma das despesas cadastradas no módulo Financeiro.
          </p>
        </div>

        {/* 4. Lucro real do mês */}
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-1">
          <p className="text-label-small text-content-secondary">
            Lucro real (mês)
          </p>
          <p
            className={`text-title ${
              realNetMonth >= 0 ? "text-green-500" : "text-red-600"
            }`}
          >
            {currencyFormatter.format(realNetMonth)}
          </p>
          <p className="text-paragraph-small text-content-secondary">
            Valor líquido (serviços + produtos) menos as despesas.
          </p>
        </div>

        {/* 5. Atendimentos */}
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-3">
          <p className="text-label-small text-content-secondary">
            Atendimentos
          </p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Concluídos */}
            <div className="space-y-1">
              <p className="text-paragraph-small text-content-secondary">
                Concluídos
              </p>
              <p className="text-paragraph-medium text-content-primary">
                Dia:{" "}
                <span className="font-semibold">
                  {totalAppointmentsDoneDay}
                </span>
              </p>
              <p className="text-paragraph-medium text-content-primary">
                Mês:{" "}
                <span className="font-semibold">
                  {totalAppointmentsDoneMonth}
                </span>
              </p>
            </div>

            {/* Cancelados */}
            <div className="space-y-1">
              <p className="text-paragraph-small text-content-secondary">
                Cancelados
              </p>
              <p className="text-paragraph-medium text-content-primary">
                Dia:{" "}
                <span className="font-semibold">
                  {totalAppointmentsCanceledDay}
                </span>
              </p>
              <p className="text-paragraph-medium text-content-primary">
                Mês:{" "}
                <span className="font-semibold">
                  {totalAppointmentsCanceledMonth}
                </span>
              </p>
            </div>

            {/* Cancelados com taxa */}
            <div className="space-y-1">
              <p className="text-paragraph-small text-content-secondary">
                Com taxa
              </p>
              <p className="text-paragraph-medium text-content-primary">
                Dia:{" "}
                <span className="font-semibold">{totalCanceledWithFeeDay}</span>
              </p>
              <p className="text-paragraph-medium text-content-primary">
                Mês:{" "}
                <span className="font-semibold">
                  {totalCanceledWithFeeMonth}
                </span>
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
