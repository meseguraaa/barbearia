// app/admin/appointments/page.tsx
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay } from "date-fns";
import type { Metadata } from "next";

import { DatePicker } from "@/components/date-picker";
import type { Appointment as AppointmentType } from "@/types/appointment";
import type { Service } from "@/types/service";
import { AdminAppointmentsByBarber } from "@/components/admin-appointments-by-barber";

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
          name: prismaAppt.barber.name ?? "",
          email: prismaAppt.barber.email ?? "",
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
    name: barber.name ?? "",
    email: barber.email ?? "",
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
              <AdminAppointmentsByBarber
                key={group.barberId ?? "no-barber"}
                group={group}
                salesCount={salesForBarber.length}
                appointmentsForForm={appointmentsForForm}
                barbersForForm={barbersForForm}
                services={services}
              />
            );
          })}
        </section>
      )}
    </div>
  );
}
