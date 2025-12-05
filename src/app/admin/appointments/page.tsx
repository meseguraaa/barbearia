// app/admin/appointments/page.tsx
import { prisma } from "@/lib/prisma";
import { format, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Metadata } from "next";

import { AppointmentActions } from "@/components/appointment-actions";
import { DatePicker } from "@/components/date-picker";
import { AppointmentForm } from "@/components/appointment-form";
import type { Appointment as AppointmentType } from "@/types/appointment";
import type { Service } from "@/types/service";
import { AppointmentStatusBadge } from "@/components/appointment-status-badge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Agendamentos",
};

type AdminAppointmentsPageProps = {
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
      service: true,
      client: true,
    },
  });

  return appointments;
}

async function getBarbers() {
  const barbers = await prisma.barber.findMany({
    where: {
      isActive: true,
    },
    orderBy: { name: "asc" },
  });

  return barbers;
}

async function getServices(): Promise<Service[]> {
  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  return services.map((s) => ({
    id: s.id,
    name: s.name,
    price: Number(s.price),
    durationMinutes: s.durationMinutes,
    isActive: s.isActive,
    barberPercentage: s.barberPercentage ? Number(s.barberPercentage) : 0,
  })) as Service[];
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
    serviceId: prismaAppt.serviceId ?? undefined,
  };
}

export default async function AdminAppointmentsPage({
  searchParams,
}: AdminAppointmentsPageProps) {
  const resolvedSearchParams = await searchParams;
  const dateParam = resolvedSearchParams.date;

  const todaySP = getSaoPauloToday();

  const selectedDate = dateParam
    ? (parseDateParam(dateParam) ?? todaySP)
    : todaySP;

  const dayStart = startOfDay(selectedDate);
  const dayEnd = endOfDay(selectedDate);

  const [appointmentsPrisma, barbersPrisma, services, dayProductSalesPrisma] =
    await Promise.all([
      getAppointments(dateParam),
      getBarbers(),
      getServices(),
      prisma.productSale.findMany({
        where: {
          soldAt: { gte: dayStart, lte: dayEnd },
        },
        include: { product: true, barber: true },
      }),
    ]);

  const appointmentsForForm = appointmentsPrisma.map(mapToAppointmentType);

  const barbersForForm = barbersPrisma.map((barber) => ({
    id: barber.id,
    name: barber.name,
    email: barber.email,
    phone: barber.phone ?? "",
    isActive: barber.isActive,
    role: "BARBER" as const,
  }));

  type AppointmentWithBarberPrisma = (typeof appointmentsPrisma)[number];
  type DayProductSale = (typeof dayProductSalesPrisma)[number];

  const groupedByBarber = appointmentsPrisma.reduce<
    Record<
      string,
      {
        barberId: string | null;
        barberName: string;
        appointments: AppointmentWithBarberPrisma[];
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
      };
    }

    acc[barberId].appointments.push(appt);

    return acc;
  }, {});

  const productSalesByBarber = dayProductSalesPrisma.reduce<
    Record<string, DayProductSale[]>
  >((acc, sale) => {
    const barberId = sale.barberId ?? "no-barber";
    if (!acc[barberId]) {
      acc[barberId] = [];
    }
    acc[barberId].push(sale);
    return acc;
  }, {});

  const barberGroups = Object.values(groupedByBarber);

  return (
    <div className="space-y-6">
      {/* HEADER + DATA */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-title text-content-primary">Agendamentos</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Gerencie os agendamentos e vendas de produtos do dia, organizados
            por barbeiro.
          </p>
        </div>

        <DatePicker />
      </div>

      {appointmentsPrisma.length === 0 && dayProductSalesPrisma.length === 0 ? (
        <section className="border border-border-primary rounded-xl overflow-hidden bg-background-tertiary">
          <div className="border-b border-border-primary px-4 py-3 bg-muted/40 flex justify-between items-center">
            <p className="font-medium">Agendamentos e vendas de produto</p>
          </div>
          <div className="p-6 text-paragraph-small text-content-secondary">
            Nenhum agendamento ou venda de produto encontrada para esta data.
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          {barberGroups.map((group) => {
            const barberKey = group.barberId ?? "no-barber";
            const salesForBarber = productSalesByBarber[barberKey] ?? [];

            return (
              <div
                key={group.barberId ?? "no-barber"}
                className="border border-border-primary rounded-xl overflow-hidden bg-background-tertiary"
              >
                <div className="border-b border-border-primary px-4 py-3 bg-muted/40 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-label-large text-content-primary">
                      {group.barberName}
                    </h2>
                    <p className="text-paragraph-small text-content-secondary">
                      Agendamento(s): {group.appointments.length} • Vendas de
                      produto: {salesForBarber.length}
                    </p>
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
                        );

                        const normalizedStatus =
                          (appt.status as AppointmentType["status"]) ??
                          "PENDING";
                        const isPending = normalizedStatus === "PENDING";

                        const safeApptForForm = apptForForm ?? {
                          id: appt.id,
                          clientName: appt.clientName,
                          phone: appt.phone,
                          description: appt.description,
                          scheduleAt: appt.scheduleAt,
                          status: normalizedStatus,
                          barberId: appt.barberId ?? "",
                          barber: appt.barber
                            ? {
                                id: appt.barber.id,
                                name: appt.barber.name,
                                email: appt.barber.email,
                                phone: appt.barber.phone,
                                isActive: appt.barber.isActive,
                                role: "BARBER" as const,
                              }
                            : undefined,
                          serviceId: appt.serviceId ?? undefined,
                        };

                        // mesmo comportamento do dashboard
                        const clientImage = appt.client?.image ?? null;
                        const clientInitial =
                          appt.clientName?.[0]?.toUpperCase() ?? "?";

                        let actionLog = "—";

                        if (appt.status === "DONE") {
                          if (appt.concludedByRole === "ADMIN") {
                            actionLog = "Concluído pelo ADMIN";
                          } else if (appt.concludedByRole === "BARBER") {
                            actionLog = "Concluído pelo Barbeiro";
                          } else {
                            actionLog = "Concluído";
                          }
                        } else if (appt.status === "CANCELED") {
                          const hasFee = appt.cancelFeeApplied;
                          const who =
                            appt.cancelledByRole === "ADMIN"
                              ? "ADMIN"
                              : appt.cancelledByRole === "BARBER"
                                ? "Barbeiro"
                                : null;

                          if (who === "ADMIN") {
                            actionLog = hasFee
                              ? "Cancelado pelo ADMIN - com taxa"
                              : "Cancelado pelo ADMIN - sem taxa";
                          } else if (who === "Barbeiro") {
                            actionLog = hasFee
                              ? "Cancelado pelo Barbeiro - com taxa"
                              : "Cancelado pelo Barbeiro - sem taxa";
                          } else {
                            actionLog = hasFee
                              ? "Cancelado - com taxa"
                              : "Cancelado - sem taxa";
                          }
                        }

                        return (
                          <tr
                            key={appt.id}
                            className="border-b border-border-primary hover:bg-muted/30"
                          >
                            {/* avatar do cliente */}
                            <td className="px-4 py-2">
                              <div className="flex items-center justify-center">
                                {clientImage ? (
                                  <img
                                    src={clientImage}
                                    alt={appt.clientName ?? "Cliente"}
                                    className="h-8 w-8 rounded-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <div className="h-8 w-8 rounded-full bg-background-secondary flex items-center justify-center text-xs font-medium text-content-secondary">
                                    {clientInitial}
                                  </div>
                                )}
                              </div>
                            </td>

                            <td className="px-4 py-2 font-medium">
                              {appt.clientName}
                            </td>
                            <td className="px-4 py-2">{appt.phone}</td>
                            <td className="px-4 py-2">{appt.description}</td>
                            <td className="px-4 py-2">{dateStr}</td>
                            <td className="px-4 py-2">{timeStr}</td>

                            <td className="px-4 py-2">
                              <AppointmentStatusBadge
                                status={normalizedStatus}
                              />
                            </td>

                            <td className="px-4 py-2">
                              <span className="text-paragraph-small text-content-secondary">
                                {actionLog}
                              </span>
                            </td>

                            <td className="px-4 py-3">
                              {isPending && (
                                <div className="flex justify-end gap-2">
                                  <AppointmentForm
                                    appointment={safeApptForForm}
                                    appointments={appointmentsForForm}
                                    barbers={barbersForForm}
                                    services={services}
                                  />

                                  <AppointmentActions
                                    appointmentId={appt.id}
                                    status={normalizedStatus}
                                    clientName={appt.clientName}
                                    phone={appt.phone}
                                    description={appt.description}
                                    scheduleAt={appt.scheduleAt}
                                    barberName={appt.barber?.name}
                                    servicePrice={
                                      appt.servicePriceAtTheTime
                                        ? Number(appt.servicePriceAtTheTime)
                                        : appt.service?.price
                                          ? Number(appt.service.price)
                                          : undefined
                                    }
                                    cancelFeePercentage={
                                      appt.service?.cancelFeePercentage
                                        ? Number(
                                            appt.service.cancelFeePercentage,
                                          )
                                        : undefined
                                    }
                                    cancelLimitHours={
                                      appt.service?.cancelLimitHours ??
                                      undefined
                                    }
                                    cancelledByRole="ADMIN"
                                    concludedByRole="ADMIN"
                                  />
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
