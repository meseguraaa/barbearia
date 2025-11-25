// app/barber/dashboard/page.tsx
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { Metadata } from "next";
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { DatePicker } from "@/components/date-picker";
import { AppointmentActions } from "@/components/appointment-actions";
import { AppointmentForm } from "@/components/appointment-form";
import { Button } from "@/components/ui/button";
import type { Appointment as AppointmentType } from "@/types/appointment";
import type { Barber as BarberType } from "@/types/barber";
import type { Service } from "@/types/service";

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

  // LOG GERAL
  console.log("BARBER DASHBOARD ▶ appointments length:", appointments.length);
  console.log(
    "BARBER DASHBOARD ▶ appointments IDs + status:",
    appointments.map((a) => ({
      id: a.id,
      status: a.status,
      barberId: a.barberId,
    })),
  );
  console.log(
    "BARBER DASHBOARD ▶ appointmentsForForm IDs:",
    appointmentsForForm.map((a) => a.id),
  );

  // barbers para o form (aqui só o barbeiro logado)
  const barbersForForm: BarberType[] = [
    {
      id: barber.id,
      name: barber.name,
      email: barber.email,
      phone: barber.phone ?? "",
      isActive: barber.isActive ?? true,
      role: "BARBER",
    },
  ];

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

  // cancelamentos com taxa (dia / mês)
  const canceledWithFeeDay = appointments.filter(
    (appt) => appt.status === "CANCELED" && appt.cancelFeeApplied,
  );
  const totalCanceledWithFeeDay = canceledWithFeeDay.length;

  const canceledWithFeeMonth = monthAppointments.filter(
    (appt) => appt.status === "CANCELED" && appt.cancelFeeApplied,
  );
  const totalCanceledWithFeeMonth = canceledWithFeeMonth.length;

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
        <DatePicker />
      </header>

      {/* RESUMO DIÁRIO / MENSAL */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-2">
          <p className="text-label-small text-content-secondary">
            Atendimentos concluídos
          </p>
          <p className="text-paragraph-medium text-content-primary">
            Dia: <span className="font-semibold">{totalDoneDay}</span>
          </p>
          <p className="text-paragraph-medium text-content-primary">
            Mês: <span className="font-semibold">{totalDoneMonth}</span>
          </p>
        </div>

        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-2">
          <p className="text-label-small text-content-secondary">
            Cancelamentos
          </p>
          <p className="text-paragraph-medium text-content-primary">
            Dia: <span className="font-semibold">{totalCanceledDay}</span>
          </p>
          <p className="text-paragraph-medium text-content-primary">
            Mês: <span className="font-semibold">{totalCanceledMonth}</span>
          </p>
        </div>

        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-2">
          <p className="text-label-small text-content-secondary">
            Cancelamentos com taxa
          </p>
          <p className="text-paragraph-medium text-content-primary">
            Dia:{" "}
            <span className="font-semibold">{totalCanceledWithFeeDay}</span>
          </p>
          <p className="text-paragraph-medium text-content-primary">
            Mês:{" "}
            <span className="font-semibold">{totalCanceledWithFeeMonth}</span>
          </p>
        </div>
      </section>

      {/* LISTA DE AGENDAMENTOS */}
      {appointments.length === 0 ? (
        <p className="text-paragraph-small text-content-secondary">
          Você não tem agendamentos para esta data.
        </p>
      ) : (
        <section className="space-y-3">
          {appointments.map((appt, index) => {
            const timeStr = appt.scheduleAt.toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            });

            const priceSnapshot = appt.servicePriceAtTheTime;
            const servicePrice = appt.service?.price ?? 0;

            const servicePriceNumber = priceSnapshot
              ? Number(priceSnapshot)
              : Number(servicePrice);

            const normalizedStatus =
              (appt.status as AppointmentType["status"]) ?? "PENDING";
            const isPending = normalizedStatus === "PENDING";

            const apptForForm = appointmentsForForm.find(
              (a) => a.id === appt.id,
            );

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

            // 🔍 LOG POR LINHA
            console.log("BARBER DASHBOARD ▶ ROW", {
              index,
              apptId: appt.id,
              statusRaw: appt.status,
              normalizedStatus,
              isPending,
              hasApptForForm: !!apptForForm,
            });

            // MINI LOG (mesma regra do admin)
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
              const who =
                appt.cancelledByRole === "ADMIN"
                  ? "ADMIN"
                  : appt.cancelledByRole === "BARBER"
                    ? "Barbeiro"
                    : null;

              if (appt.cancelFeeApplied) {
                // com taxa
                if (who) {
                  actionLog = `Cancelado pelo ${who} - com taxa`;
                } else {
                  actionLog = "Cancelado - com taxa";
                }
              } else {
                // sem taxa
                if (who) {
                  actionLog = `Cancelado pelo ${who} - sem taxa`;
                } else {
                  actionLog = "Cancelado - sem taxa";
                }
              }
            }

            return (
              <div
                key={appt.id}
                className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3"
              >
                {/* Layout: infos em grid + ações separadas */}
                <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  {/* Infos do agendamento */}
                  <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-6 md:items-center">
                    {/* Nome */}
                    <div>
                      <span className="text-paragraph-medium text-content-primary font-medium">
                        {appt.clientName}
                      </span>
                    </div>

                    {/* Telefone */}
                    <div className="text-paragraph-medium text-content-primary">
                      {appt.phone}
                    </div>

                    {/* Descrição */}
                    <div className="text-paragraph-medium text-content-primary">
                      {appt.description}
                    </div>

                    {/* Status */}
                    <div className="flex md:justify-center">
                      <AppointmentStatusBadge status={normalizedStatus} />
                    </div>

                    {/* Log */}
                    <div className="text-paragraph-small text-content-secondary md:text-center">
                      {actionLog}
                    </div>

                    {/* Horário */}
                    <div className="text-paragraph-medium text-content-primary md:text-center">
                      {timeStr}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex flex-wrap justify-end gap-2 md:flex-nowrap md:min-w-[260px]">
                    {isPending && (
                      <>
                        {/* EDITAR – só aparece enquanto PENDENTE */}
                        <AppointmentForm
                          appointment={safeApptForForm}
                          appointments={appointmentsForForm}
                          barbers={barbersForForm}
                          services={services}
                        />

                        {/* CONFERIR / CONCLUIR + CANCELAR – só se PENDENTE */}
                        <AppointmentActions
                          appointmentId={appt.id}
                          status={normalizedStatus}
                          clientName={appt.clientName}
                          phone={appt.phone}
                          description={appt.description}
                          scheduleAt={appt.scheduleAt}
                          barberName={barber.name}
                          servicePrice={servicePriceNumber}
                          cancelFeePercentage={
                            appt.service?.cancelFeePercentage
                              ? Number(appt.service.cancelFeePercentage)
                              : undefined
                          }
                          cancelLimitHours={
                            appt.service?.cancelLimitHours ?? undefined
                          }
                          cancelledByRole="BARBER"
                          concludedByRole="BARBER"
                        />
                      </>
                    )}
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
