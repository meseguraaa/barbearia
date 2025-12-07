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
    allReviewsPrisma,
    allReviewsOverallPrisma,
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
    // ⭐ avaliações filtradas pelo mês selecionado (createdAt)
    prisma.appointmentReview.findMany({
      where: {
        createdAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
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
    // ⭐ todas as avaliações históricas (para média geral)
    prisma.appointmentReview.findMany({
      select: {
        rating: true,
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
      if (b.avgRating !== a.avgRating) {
        return b.avgRating - a.avgRating;
      }
      if (b.totalReviews !== a.totalReviews) {
        return b.totalReviews - a.totalReviews;
      }
      return a.barberName.localeCompare(b.barberName);
    },
  );

  // 🔹 Tags positivas x negativas (por mês, baseado na nota)
  const positiveTagMap = new Map<string, number>();
  const negativeTagMap = new Map<string, number>();

  for (const review of allReviewsPrisma) {
    const isPositive = review.rating >= 3;
    const isNegative = review.rating <= 2;

    for (const rt of review.tags ?? []) {
      const label = rt.tag.label;

      if (isPositive) {
        positiveTagMap.set(label, (positiveTagMap.get(label) ?? 0) + 1);
      }

      if (isNegative) {
        negativeTagMap.set(label, (negativeTagMap.get(label) ?? 0) + 1);
      }
    }
  }

  const topPositiveTags = Array.from(positiveTagMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label);
    })
    .slice(0, 8);

  const topNegativeTags = Array.from(negativeTagMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label);
    })
    .slice(0, 8);

  // 🔹 Feedbacks positivos (3–5 estrelas no mês) e negativos (1–2)
  const positiveReviews = allReviewsPrisma.filter((r) => r.rating >= 3);
  const negativeReviews = allReviewsPrisma.filter((r) => r.rating <= 2);

  const recentPositiveReviews = [...positiveReviews]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5);

  const recentNegativeReviews = [...negativeReviews]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5);

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

      {/* AVALIAÇÕES DE CLIENTES (POR MÊS + HISTÓRICO) */}
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

            {/* MOTIVOS POSITIVOS / NEGATIVOS MAIS CITADOS */}
            <div className="grid gap-4 border-t border-border-primary/60 pt-4 md:grid-cols-2">
              {/* POSITIVOS */}
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

              {/* NEGATIVOS */}
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

            {/* FEEDBACKS POSITIVOS / NEGATIVOS RECENTES */}
            <div className="border-t border-border-primary/60 pt-4">
              <div className="grid gap-4 md:grid-cols-2">
                {/* POSITIVOS */}
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

                {/* NEGATIVOS */}
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
    </div>
  );
}
