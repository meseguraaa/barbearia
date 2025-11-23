// app/admin/dashboard/page.tsx
import { prisma } from "@/lib/prisma";
import {
  format,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Metadata } from "next";
import { AppointmentActions } from "@/components/appointment-actions";
import { DatePicker } from "@/components/date-picker";
import { AppointmentForm } from "@/components/appointment-form";
import { Button } from "@/components/ui/button";
import type { Appointment as AppointmentType } from "@/types/appointment";
import type { Barber } from "@/types/barber";
import { AppointmentStatusBadge } from "@/components/appointment-status-badge";

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
      barber: true,
      service: true, // para poder calcular financeiro
    },
  });

  return appointments;
}

async function getBarbers(): Promise<Barber[]> {
  const barbers = await prisma.barber.findMany({
    where: {
      isActive: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  return barbers.map((barber) => ({
    id: barber.id,
    name: barber.name,
    email: barber.email,
    phone: barber.phone,
    isActive: barber.isActive,
    role: "BARBER",
  }));
}

function mapToAppointmentType(prismaAppt: any): AppointmentType {
  return {
    id: prismaAppt.id,
    clientName: prismaAppt.clientName,
    phone: prismaAppt.phone,
    description: prismaAppt.description,
    scheduleAt: prismaAppt.scheduleAt,
    status: prismaAppt.status ?? "PENDING",
    barberId: prismaAppt.barberId ?? "",
    barber: prismaAppt.barber
      ? {
          id: prismaAppt.barber.id,
          name: prismaAppt.barber.name,
          email: prismaAppt.barber.email,
          phone: prismaAppt.barber.phone,
          isActive: prismaAppt.barber.isActive,
          role: "BARBER",
        }
      : undefined,
  };
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

  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);

  const [appointmentsPrisma, barbers, monthAppointmentsPrisma] =
    await Promise.all([
      getAppointments(dateParam),
      getBarbers(),
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
    ]);

  const appointmentsForForm: AppointmentType[] =
    appointmentsPrisma.map(mapToAppointmentType);

  type AppointmentWithBarberPrisma = (typeof appointmentsPrisma)[number];

  // ====== FINANCEIRO GERAL DO DIA ======
  const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

  const doneAppointments = appointmentsPrisma.filter(
    (appt) => appt.status === "DONE",
  );

  const { totalGrossDay, totalCommissionDay, totalNetDay } =
    doneAppointments.reduce(
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

  // ====== FINANCEIRO GERAL DO MÊS (baseado no dia selecionado) ======
  const { totalGrossMonth, totalCommissionMonth, totalNetMonth } =
    monthAppointmentsPrisma.reduce(
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

  // ====== AGRUPADO POR BARBEIRO (COM TOTAIS DIÁRIOS) ======
  const groupedByBarber = appointmentsPrisma.reduce<
    Record<
      string,
      {
        barberId: string | null;
        barberName: string;
        appointments: AppointmentWithBarberPrisma[];
        totalGross: number;
        totalCommission: number;
        totalNet: number;
      }
    >
  >((acc, appt) => {
    const barberId = appt.barberId ?? "no-barber";
    const barberName = appt.barber?.name ?? "Sem barbeiro";

    if (!acc[barberId]) {
      acc[barberId] = {
        barberId: appt.barberId ?? null,
        barberName,
        appointments: [],
        totalGross: 0,
        totalCommission: 0,
        totalNet: 0,
      };
    }

    acc[barberId].appointments.push(appt);

    // Só conta financeiro se o atendimento foi concluído (visão diária por barbeiro)
    if (appt.status === "DONE") {
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

      acc[barberId].totalGross += priceNumber;
      acc[barberId].totalCommission += earningNumber;
      acc[barberId].totalNet += priceNumber - earningNumber;
    }

    return acc;
  }, {});

  const barberGroups = Object.values(groupedByBarber);

  return (
    <div className="space-y-6">
      {/* HEADER + DATA */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-title text-content-primary">Dashboard</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Visão geral de todos os agendamentos.
          </p>
        </div>

        <DatePicker />
      </div>

      {/* RESUMO FINANCEIRO DO DIA */}
      <section className="grid gap-4 md:grid-cols-3">
        {/* Valor bruto do dia */}
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-1">
          <p className="text-label-small text-content-secondary">
            Valor bruto (dia)
          </p>
          <p className="text-title text-content-primary">
            {currencyFormatter.format(totalGrossDay)}
          </p>
        </div>

        {/* Valor em comissão do dia */}
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-1">
          <p className="text-label-small text-content-secondary">
            Valor em comissão (dia)
          </p>
          <p className="text-title text-content-primary">
            {currencyFormatter.format(totalCommissionDay)}
          </p>
        </div>

        {/* Valor líquido do dia */}
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-1">
          <p className="text-label-small text-content-secondary">
            Valor líquido (dia)
          </p>
          <p className="text-title text-content-primary">
            {currencyFormatter.format(totalNetDay)}
          </p>
        </div>
      </section>

      {/* RESUMO FINANCEIRO DO MÊS + ATENDIMENTOS */}
      <section className="grid gap-4 md:grid-cols-3">
        {/* Valor bruto do mês */}
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-1">
          <p className="text-label-small text-content-secondary">
            Valor bruto (mês)
          </p>
          <p className="text-title text-content-primary">
            {currencyFormatter.format(totalGrossMonth)}
          </p>
        </div>

        {/* Valor líquido do mês */}
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-1">
          <p className="text-label-small text-content-secondary">
            Valor líquido (mês)
          </p>
          <p className="text-title text-content-primary">
            {currencyFormatter.format(totalNetMonth)}
          </p>
        </div>

        {/* Atendimentos concluídos - dia e mês */}
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-1">
          <p className="text-label-small text-content-secondary">
            Atendimentos concluídos
          </p>
          <p className="text-paragraph-medium text-content-primary">
            Dia:{" "}
            <span className="font-semibold">{totalAppointmentsDoneDay}</span>
          </p>
          <p className="text-paragraph-medium text-content-primary">
            Mês:{" "}
            <span className="font-semibold">{totalAppointmentsDoneMonth}</span>
          </p>
        </div>
      </section>

      {appointmentsPrisma.length === 0 ? (
        <section className="border border-border-primary rounded-xl overflow-hidden bg-background-tertiary">
          <div className="border-b border-border-primary px-4 py-3 bg-muted/40 flex justify-between items-center">
            <p className="font-medium">Agendamentos</p>
          </div>
          <div className="p-6 text-paragraph-small text-content-secondary">
            Nenhum agendamento encontrado.
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          {barberGroups.map((group) => (
            <div
              key={group.barberId ?? "no-barber"}
              className="border border-border-primary rounded-xl overflow-hidden bg-background-tertiary"
            >
              <div className="border-b border-border-primary px-4 py-3 bg-muted/40 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-label-large text-content-primary">
                    {group.barberName}
                  </h2>
                  <p className="text-paragraph-small text-content-secondary">
                    Agendamento(s): {group.appointments.length}
                  </p>
                </div>

                {/* Totais por barbeiro (no dia) */}
                <div className="flex flex-wrap gap-4 text-right">
                  <div className="space-y-0.5">
                    <p className="text-label-small text-content-secondary">
                      Bruto (dia)
                    </p>
                    <p className="text-paragraph-medium text-content-primary">
                      {currencyFormatter.format(group.totalGross)}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-label-small text-content-secondary">
                      Comissão (dia)
                    </p>
                    <p className="text-paragraph-medium text-content-primary">
                      {currencyFormatter.format(group.totalCommission)}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-label-small text-content-secondary">
                      Líquido (dia)
                    </p>
                    <p className="text-paragraph-medium text-content-primary">
                      {currencyFormatter.format(group.totalNet)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <tbody>
                    {group.appointments.map((appt) => {
                      const date = new Date(appt.scheduleAt);

                      const dateStr = format(date, "dd/MM/yyyy", {
                        locale: ptBR,
                      });

                      const timeStr = format(date, "HH:mm", {
                        locale: ptBR,
                      });

                      const apptForForm = appointmentsForForm.find(
                        (a) => a.id === appt.id,
                      )!;

                      const isFinished =
                        appt.status === "DONE" || appt.status === "CANCELED";

                      return (
                        <tr
                          key={appt.id}
                          className="border-b border-border-primary hover:bg-muted/30"
                        >
                          <td className="px-4 py-2 font-medium">
                            {appt.clientName}
                          </td>
                          <td className="px-4 py-2">{appt.phone}</td>
                          <td className="px-4 py-2">{appt.description}</td>
                          <td className="px-4 py-2">{dateStr}</td>
                          <td className="px-4 py-2">{timeStr}</td>
                          <td className="px-4 py-2">
                            <AppointmentStatusBadge status={appt.status} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              {!isFinished && (
                                <AppointmentForm
                                  appointment={apptForForm}
                                  appointments={appointmentsForForm}
                                  barbers={barbers}
                                >
                                  <Button variant="edit2" size="sm">
                                    Editar
                                  </Button>
                                </AppointmentForm>
                              )}

                              <AppointmentActions
                                appointmentId={appt.id}
                                status={appt.status}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <p className="text-paragraph-medium text-content-primary px-1 text-right">
            Total de atendimentos no dia: {appointmentsPrisma.length}
          </p>
        </section>
      )}
    </div>
  );
}
