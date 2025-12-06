// app/barber/dashboard/page.tsx
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { Metadata } from "next";
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";

import type { Appointment as AppointmentType } from "@/types/appointment";
import type { Service } from "@/types/service";

import { DatePicker } from "@/components/date-picker";
import { BarberDashboardSummary } from "@/components/barber-dashboard-summary";
import {
  BarberAppointmentCard,
  type BarberDashboardAppointment,
} from "@/components/barber-appointment-card";

const SESSION_COOKIE_NAME = "painel_session";

function getJwtSecretKey() {
  const secret = process.env.PAINEL_JWT_SECRET;
  if (!secret) {
    throw new Error("PAINEL_JWT_SECRET não definido no .env");
  }
  return new TextEncoder().encode(secret);
}

type PainelSessionPayload = {
  sub: string;
  role: "CLIENT" | "BARBER" | "ADMIN";
  email: string;
  name?: string | null;
};

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

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Barbeiro | Minha agenda",
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

// ===== Services helper (igual ao admin) =====
async function getServices(): Promise<Service[]> {
  const services = await prisma.service.findMany({
    where: {
      isActive: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  return services.map((service) => ({
    id: service.id,
    name: service.name,
    price: Number(service.price),
    durationMinutes: service.durationMinutes,
    isActive: service.isActive,
    barberPercentage: service.barberPercentage
      ? Number(service.barberPercentage)
      : 0,
  })) as Service[];
}

// ===== Mapeia prisma -> AppointmentType (igual padrão do admin) =====
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

type BarberDashboardPageProps = {
  searchParams: Promise<{
    date?: string;
  }>;
};

export default async function BarberDashboardPage({
  searchParams,
}: BarberDashboardPageProps) {
  const { barber } = await getCurrentBarber();

  if (!barber) {
    return (
      <div className="space-y-4">
        <h2 className="text-title text-content-primary">Minha agenda</h2>
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

  const start = startOfDay(baseDate);
  const end = endOfDay(baseDate);

  const monthStart = startOfMonth(baseDate);
  const monthEnd = endOfMonth(baseDate);

  const [appointments, monthAppointments, services] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        barberId: barber.id,
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
        barber: true,
        client: true,
        // 🔹 traz o plano do cliente pra calcular créditos
        clientPlan: {
          include: {
            plan: true,
          },
        },
      },
    }),
    prisma.appointment.findMany({
      where: {
        barberId: barber.id,
        scheduleAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      select: {
        id: true,
        status: true,
        cancelFeeApplied: true,
      },
    }),
    getServices(),
  ]);

  // lista que o AppointmentForm usa (igual admin)
  const appointmentsForForm: AppointmentType[] =
    appointments.map(mapToAppointmentType);

  // barbers para o form (aqui só o barbeiro logado)
  const barbersForForm = [
    {
      id: barber.id,
      name: barber.name ?? "Barbeiro",
      email: barber.email,
      phone: barber.phone ?? "",
      isActive: barber.isActive ?? true,
      role: "BARBER" as const,
    },
  ];

  // ------- MÉTRICAS -------
  const totalDoneDay = appointments.filter(
    (appt) => appt.status === "DONE",
  ).length;

  const totalCanceledDay = appointments.filter(
    (appt) => appt.status === "CANCELED",
  ).length;

  const totalDoneMonth = monthAppointments.filter(
    (appt) => appt.status === "DONE",
  ).length;

  const totalCanceledMonth = monthAppointments.filter(
    (appt) => appt.status === "CANCELED",
  ).length;

  const canceledWithFeeDay = appointments.filter(
    (appt) => appt.status === "CANCELED" && appt.cancelFeeApplied,
  );
  const totalCanceledWithFeeDay = canceledWithFeeDay.length;

  const canceledWithFeeMonth = monthAppointments.filter(
    (appt) => appt.status === "CANCELED" && appt.cancelFeeApplied,
  );
  const totalCanceledWithFeeMonth = canceledWithFeeMonth.length;

  // ------- MAPEIA PARA O TIPO DO CARD -------
  const barberDashboardAppointments: BarberDashboardAppointment[] =
    appointments.map((appt) => {
      // 🔹 Cálculo de créditos do plano para este agendamento
      let isPlanCredit = false;
      let planCreditIndex: number | null = null;
      let planTotalCredits: number | null = null;

      if (appt.clientPlan && appt.clientPlan.plan) {
        const totalCredits = appt.clientPlan.plan.totalBookings;
        const usedBookings = appt.clientPlan.usedBookings;

        planTotalCredits = totalCredits;

        if (appt.status === "DONE") {
          // plano já teve este crédito consumido
          if (usedBookings > 0) {
            const idx = Math.min(usedBookings, totalCredits);
            if (idx <= totalCredits) {
              isPlanCredit = true;
              planCreditIndex = idx;
            }
          }
        } else {
          // PENDING (ou outro status não-DONE): se ainda há crédito, este é o próximo
          if (usedBookings < totalCredits) {
            isPlanCredit = true;
            planCreditIndex = usedBookings + 1;
          }
        }
      }

      return {
        id: appt.id,
        clientName: appt.clientName,
        phone: appt.phone,
        description: appt.description,
        scheduleAt: appt.scheduleAt,
        status: appt.status,
        barberId: appt.barberId,
        barber: appt.barber
          ? {
              id: appt.barber.id,
              name: appt.barber.name,
              email: appt.barber.email,
              phone: appt.barber.phone,
              isActive: appt.barber.isActive,
            }
          : null,
        serviceId: appt.serviceId,
        service: appt.service
          ? {
              price: Number(appt.service.price),
              cancelFeePercentage:
                appt.service.cancelFeePercentage != null
                  ? Number(appt.service.cancelFeePercentage)
                  : null,
              cancelLimitHours: appt.service.cancelLimitHours,
            }
          : null,
        client: appt.client
          ? {
              image: appt.client.image,
            }
          : null,
        cancelFeeApplied: appt.cancelFeeApplied,
        cancelledByRole: appt.cancelledByRole,
        concludedByRole: appt.concludedByRole,
        servicePriceAtTheTime: appt.servicePriceAtTheTime
          ? Number(appt.servicePriceAtTheTime)
          : null,
        // 🔹 infos de plano para o card
        isPlanCredit,
        planCreditIndex,
        planTotalCredits,
      };
    });

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-title text-content-primary">Minha agenda</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Veja os horários agendados para a data selecionada.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <DatePicker />
        </div>
      </header>

      {/* RESUMO DIÁRIO / MENSAL */}
      <BarberDashboardSummary
        totalDoneDay={totalDoneDay}
        totalDoneMonth={totalDoneMonth}
        totalCanceledDay={totalCanceledDay}
        totalCanceledMonth={totalCanceledMonth}
        totalCanceledWithFeeDay={totalCanceledWithFeeDay}
        totalCanceledWithFeeMonth={totalCanceledWithFeeMonth}
      />

      {/* LISTA DE AGENDAMENTOS */}
      {barberDashboardAppointments.length === 0 ? (
        <p className="text-paragraph-small text-content-secondary">
          Você não tem agendamentos para esta data.
        </p>
      ) : (
        <section className="space-y-3">
          {barberDashboardAppointments.map((appt) => {
            const apptForForm = appointmentsForForm.find(
              (a) => a.id === appt.id,
            );

            return (
              <BarberAppointmentCard
                key={appt.id}
                appointment={appt}
                appointmentForForm={apptForForm}
                appointmentsForForm={appointmentsForForm}
                barbersForForm={barbersForForm}
                services={services}
                barberName={barber.name ?? "Barbeiro"}
              />
            );
          })}
        </section>
      )}
    </div>
  );
}
