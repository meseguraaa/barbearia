// app/barber/earnings/page.tsx
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { Metadata } from "next";
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import { DatePicker } from "@/components/date-picker";

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
    const { payload: raw } = await jwtVerify(token, getJwtSecretKey());
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

  // Atendimentos concluídos do DIA
  const dayAppointments = await prisma.appointment.findMany({
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
  });

  // ❌ Atendimentos CANCELADOS do DIA (para contagem)
  const dayCanceledAppointments = await prisma.appointment.findMany({
    where: {
      barberId: barber.id,
      status: "CANCELED",
      scheduleAt: {
        gte: dayStart,
        lte: dayEnd,
      },
    },
  });

  // Atendimentos concluídos do MÊS
  const monthAppointments = await prisma.appointment.findMany({
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
  });

  // ❌ Atendimentos CANCELADOS do MÊS (para contagem)
  const monthCanceledAppointments = await prisma.appointment.findMany({
    where: {
      barberId: barber.id,
      status: "CANCELED",
      scheduleAt: {
        gte: monthStart,
        lte: monthEnd,
      },
    },
  });

  const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

  // ===== GANHOS NO DIA (soma do que o barbeiro ganha) =====
  const totalEarningsDay = dayAppointments.reduce((sum, appt) => {
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

  // ===== GANHOS DO MÊS (soma dos ganhos de todos os dias do mês) =====
  const totalEarningsMonth = monthAppointments.reduce((sum, appt) => {
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

  // ✅ Concluídos
  const totalAppointmentsDay = dayAppointments.length;
  const totalAppointmentsMonth = monthAppointments.length;

  // ✅ Cancelados
  const totalAppointmentsCanceledDay = dayCanceledAppointments.length;
  const totalAppointmentsCanceledMonth = monthCanceledAppointments.length;

  return (
    <div className="space-y-6">
      {/* HEADER LOCAL (com DatePicker na mesma linha) */}
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-title text-content-primary">Meus ganhos</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Ganhos do dia selecionado e faturamento acumulado no mês.
          </p>
        </div>
        <DatePicker />
      </header>

      {/* RESUMO */}
      <section className="grid gap-4 md:grid-cols-3">
        {/* Ganhos no dia */}
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-1">
          <p className="text-label-small text-content-secondary">
            Ganhos no dia
          </p>
          <p className="text-title text-content-primary">
            {currencyFormatter.format(totalEarningsDay)}
          </p>
        </div>

        {/* Faturamento do mês (soma dos ganhos do mês) */}
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-1">
          <p className="text-label-small text-content-secondary">
            Faturamento do mês
          </p>
          <p className="text-title text-content-primary">
            {currencyFormatter.format(totalEarningsMonth)}
          </p>
        </div>

        {/* Atendimentos concluídos e cancelados */}
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-3">
          <p className="text-label-small text-content-secondary">
            Atendimentos
          </p>

          <div className="grid grid-cols-2 gap-4">
            {/* Concluídos */}
            <div className="space-y-1">
              <p className="text-paragraph-small text-content-secondary">
                Concluídos
              </p>
              <p className="text-paragraph-medium text-content-primary">
                Dia:{" "}
                <span className="font-semibold">{totalAppointmentsDay}</span>
              </p>
              <p className="text-paragraph-medium text-content-primary">
                Mês:{" "}
                <span className="font-semibold">{totalAppointmentsMonth}</span>
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
          </div>
        </div>
      </section>

      {/* LISTA DE ATENDIMENTOS DO DIA */}
      {dayAppointments.length === 0 ? (
        <p className="text-paragraph-small text-content-secondary">
          Você não possui atendimentos concluídos para esta data.
        </p>
      ) : (
        <section className="space-y-3">
          {dayAppointments.map((appt) => {
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

            return (
              <div
                key={appt.id}
                className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3"
              >
                <div className="grid w-full grid-cols-1 gap-2 md:grid-cols-5 md:items-center">
                  {/* Cliente + serviço */}
                  <div>
                    <span className="text-paragraph-medium text-content-primary font-medium">
                      {appt.clientName}
                    </span>
                    <p className="text-paragraph-small text-content-secondary">
                      {appt.description}
                    </p>
                  </div>

                  {/* Horário */}
                  <div className="text-paragraph-medium text-content-primary md:text-center">
                    {timeStr}
                  </div>

                  {/* Valor do serviço */}
                  <div className="text-paragraph-medium text-content-primary md:text-center">
                    {currencyFormatter.format(priceNumber)}
                  </div>

                  {/* % do barbeiro */}
                  <div className="text-paragraph-medium text-content-primary md:text-center">
                    {percentNumber.toFixed(2)}%
                  </div>

                  {/* Ganho do barbeiro */}
                  <div className="text-paragraph-medium text-content-primary md:text-right">
                    {currencyFormatter.format(earningNumber)}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
