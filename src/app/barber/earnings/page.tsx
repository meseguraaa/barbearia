// app/barber/earnings/page.tsx
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { Metadata } from "next";
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";

import { DatePicker } from "@/components/date-picker";
import { BarberEarningsSummary } from "@/components/barber-earnings-summary";
import { BarberEarningsDayList } from "@/components/barber-earnings-day-list";

const SESSION_COOKIE_NAME = "painel_session";
const SAO_PAULO_TIMEZONE = "America/Sao_Paulo";

type PainelSessionPayload = {
  sub: string;
  role: "CLIENT" | "BARBER" | "ADMIN";
  email: string;
  name?: string | null;
};

function getJwtSecretKey() {
  const secret = process.env.PAINEL_JWT_SECRET;
  if (!secret) {
    throw new Error("PAINEL_JWT_SECRET não definido no .env");
  }
  return new TextEncoder().encode(secret);
}

async function getCurrentBarber() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    redirect("/painel/login");
  }

  let payload: PainelSessionPayload | null = null;

  try {
    const { payload: raw } = await jwtVerify(token!, getJwtSecretKey());
    payload = raw as PainelSessionPayload;
  } catch {
    redirect("/painel/login");
  }

  if (!payload || payload.role !== "BARBER") {
    redirect("/painel/login");
  }

  const barber = await prisma.barber.findUnique({
    where: { email: payload.email },
  });

  return { barber, session: payload };
}

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

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Barbeiro | Ganhos",
};

type BarberEarningsPageProps = {
  searchParams: Promise<{
    date?: string;
  }>;
};

export default async function BarberEarningsPage({
  searchParams,
}: BarberEarningsPageProps) {
  const { barber } = await getCurrentBarber();

  if (!barber) {
    return (
      <div className="space-y-4">
        <h2 className="text-title text-content-primary">Ganhos</h2>
        <p className="text-paragraph-medium text-content-secondary">
          Sua conta ainda não está vinculada a um barbeiro cadastrado. Peça para
          um administrador associar seu usuário a um barbeiro na área
          administrativa.
        </p>
      </div>
    );
  }

  const resolvedSearchParams = await searchParams;
  const dateParam = resolvedSearchParams.date;

  const baseDate = dateParam
    ? (parseDateParam(dateParam) ?? getSaoPauloToday())
    : getSaoPauloToday();

  // Intervalo do dia selecionado
  const dayStart = startOfDay(baseDate);
  const dayEnd = endOfDay(baseDate);

  // Intervalo do mês selecionado
  const monthStart = startOfMonth(baseDate);
  const monthEnd = endOfMonth(baseDate);

  const [
    dayAppointments,
    dayCanceledAppointments,
    monthAppointments,
    monthCanceledAppointments,
    dayProductSales,
    monthProductSales,
  ] = await Promise.all([
    // Atendimentos concluídos do DIA
    prisma.appointment.findMany({
      where: {
        barberId: barber.id,
        status: "DONE",
        scheduleAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      include: {
        service: true,
      },
      orderBy: {
        scheduleAt: "asc",
      },
    }),
    // Atendimentos CANCELADOS do DIA
    prisma.appointment.findMany({
      where: {
        barberId: barber.id,
        status: "CANCELED",
        scheduleAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
    }),
    // Atendimentos concluídos do MÊS
    prisma.appointment.findMany({
      where: {
        barberId: barber.id,
        status: "DONE",
        scheduleAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      include: {
        service: true,
      },
      orderBy: {
        scheduleAt: "asc",
      },
    }),
    // Atendimentos CANCELADOS do MÊS
    prisma.appointment.findMany({
      where: {
        barberId: barber.id,
        status: "CANCELED",
        scheduleAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
    }),
    // VENDAS DE PRODUTOS DO DIA (deste barbeiro)
    prisma.productSale.findMany({
      where: {
        barberId: barber.id,
        soldAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      include: {
        product: true,
      },
    }),
    // VENDAS DE PRODUTOS DO MÊS (deste barbeiro)
    prisma.productSale.findMany({
      where: {
        barberId: barber.id,
        soldAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      include: {
        product: true,
      },
    }),
  ]);

  const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

  // ===== GANHOS NO DIA (SERVIÇOS) =====
  const totalServiceEarningsDay = dayAppointments.reduce((sum, appt) => {
    const earningSnapshot = appt.barberEarningValue;
    const priceSnapshot = appt.servicePriceAtTheTime;
    const priceService = appt.service?.price ?? 0;
    const percentSnapshot = appt.barberPercentageAtTheTime;
    const percentService = appt.service?.barberPercentage ?? 0;

    let earningNumber: number;

    if (earningSnapshot) {
      earningNumber = Number(earningSnapshot);
    } else {
      const priceNumber = priceSnapshot
        ? Number(priceSnapshot)
        : Number(priceService);
      const percentNumber = percentSnapshot
        ? Number(percentSnapshot)
        : Number(percentService);
      earningNumber = (priceNumber * percentNumber) / 100;
    }

    return sum + earningNumber;
  }, 0);

  // ===== GANHOS DO MÊS (SERVIÇOS) =====
  const totalServiceEarningsMonth = monthAppointments.reduce((sum, appt) => {
    const earningSnapshot = appt.barberEarningValue;
    const priceSnapshot = appt.servicePriceAtTheTime;
    const priceService = appt.service?.price ?? 0;
    const percentSnapshot = appt.barberPercentageAtTheTime;
    const percentService = appt.service?.barberPercentage ?? 0;

    let earningNumber: number;

    if (earningSnapshot) {
      earningNumber = Number(earningSnapshot);
    } else {
      const priceNumber = priceSnapshot
        ? Number(priceSnapshot)
        : Number(priceService);
      const percentNumber = percentSnapshot
        ? Number(percentSnapshot)
        : Number(percentService);
      earningNumber = (priceNumber * percentNumber) / 100;
    }

    return sum + earningNumber;
  }, 0);

  // ===== PRODUTOS (RECEITA + GANHO DO BARBEIRO) =====
  const totalProductsSoldDay = dayProductSales.reduce(
    (sum, sale) => sum + sale.quantity,
    0,
  );
  const totalProductsSoldMonth = monthProductSales.reduce(
    (sum, sale) => sum + sale.quantity,
    0,
  );

  const totalProductsRevenueDay = dayProductSales.reduce((sum, sale) => {
    return sum + Number(sale.totalPrice);
  }, 0);

  const totalProductsRevenueMonth = monthProductSales.reduce((sum, sale) => {
    return sum + Number(sale.totalPrice);
  }, 0);

  const totalProductEarningsDay = dayProductSales.reduce((sum, sale) => {
    const percent = sale.product?.barberPercentage ?? 0;
    const total = Number(sale.totalPrice);
    const commission = (total * percent) / 100;
    return sum + commission;
  }, 0);

  const totalProductEarningsMonth = monthProductSales.reduce((sum, sale) => {
    const percent = sale.product?.barberPercentage ?? 0;
    const total = Number(sale.totalPrice);
    const commission = (total * percent) / 100;
    return sum + commission;
  }, 0);

  // ✅ Concluídos
  const totalAppointmentsDay = dayAppointments.length;
  const totalAppointmentsMonth = monthAppointments.length;

  // ✅ Cancelados
  const totalAppointmentsCanceledDay = dayCanceledAppointments.length;
  const totalAppointmentsCanceledMonth = monthCanceledAppointments.length;

  // 💰 TAXAS DE CANCELAMENTO (100% do barbeiro)
  const canceledWithFeeDay = dayCanceledAppointments.filter(
    (appt) => appt.cancelFeeApplied,
  );

  const totalCancelFeeDay = canceledWithFeeDay.reduce((sum, appt) => {
    const fee = appt.cancelFeeValue ? Number(appt.cancelFeeValue) : 0;
    return sum + fee;
  }, 0);

  const canceledWithFeeMonth = monthCanceledAppointments.filter(
    (appt) => appt.cancelFeeApplied,
  );

  const totalCancelFeeMonth = canceledWithFeeMonth.reduce((sum, appt) => {
    const fee = appt.cancelFeeValue ? Number(appt.cancelFeeValue) : 0;
    return sum + fee;
  }, 0);

  // 🔗 Ganhos totais
  const totalEarningsDay = totalServiceEarningsDay + totalProductEarningsDay;
  const totalEarningsMonth =
    totalServiceEarningsMonth + totalProductEarningsMonth + totalCancelFeeMonth;

  // ===== FORMATAÇÕES PARA A UI =====
  const summaryProps = {
    totalEarningsDay: currencyFormatter.format(totalEarningsDay),
    serviceEarningsDay: currencyFormatter.format(totalServiceEarningsDay),
    productEarningsDay: currencyFormatter.format(totalProductEarningsDay),

    cancelFeeDay: currencyFormatter.format(totalCancelFeeDay),
    cancelFeeMonth: currencyFormatter.format(totalCancelFeeMonth),

    totalAppointmentsDay,
    totalAppointmentsMonth,
    totalAppointmentsCanceledDay,
    totalAppointmentsCanceledMonth,

    totalEarningsMonth: currencyFormatter.format(totalEarningsMonth),
    serviceEarningsMonth: currencyFormatter.format(totalServiceEarningsMonth),
    productEarningsMonth: currencyFormatter.format(totalProductEarningsMonth),

    totalProductsSoldDay,
    totalProductsSoldMonth,
    productEarningsDayLabel: currencyFormatter.format(totalProductEarningsDay),
    productEarningsMonthLabel: currencyFormatter.format(
      totalProductEarningsMonth,
    ),
  };

  // ===== LINHAS DE ATENDIMENTOS DO DIA =====
  const dayAppointmentsRows = dayAppointments.map((appt) => {
    const timeStr = appt.scheduleAt.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

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

    return {
      id: appt.id,
      clientName: appt.clientName ?? "",
      description: appt.description ?? "",
      time: timeStr,
      priceFormatted: currencyFormatter.format(priceNumber),
      percentageFormatted: `${percentNumber.toFixed(2)}%`,
      earningFormatted: currencyFormatter.format(earningNumber),
    };
  });

  return (
    <div className="space-y-6">
      {/* HEADER LOCAL (com DatePicker na mesma linha) */}
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-title text-content-primary">Meus ganhos</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Ganhos do dia e faturamento acumulado no mês.
          </p>
        </div>
        <DatePicker />
      </header>

      {/* RESUMO */}
      <BarberEarningsSummary {...summaryProps} />

      {/* LISTA DE ATENDIMENTOS DO DIA */}
      <BarberEarningsDayList appointments={dayAppointmentsRows} />
    </div>
  );
}
