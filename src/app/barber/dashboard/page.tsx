// app/barber/dashboard/page.tsx
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { Metadata } from "next";
import { startOfDay, endOfDay } from "date-fns";
import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/date-picker";
import { markAppointmentDone, cancelAppointment } from "./actions";

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
  title: "Minha agenda | Barbeiro",
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
      <main className="space-y-4">
        <h2 className="text-title text-content-primary">Minha agenda</h2>
        <p className="text-paragraph-medium text-content-secondary">
          Sua conta ainda não está vinculada a um barbeiro cadastrado. Peça para
          um administrador associar seu usuário a um barbeiro na área
          administrativa.
        </p>
      </main>
    );
  }

  const resolvedSearchParams = await searchParams;
  const dateParam = resolvedSearchParams.date;

  const baseDate = dateParam
    ? (parseDateParam(dateParam) ?? getSaoPauloToday())
    : getSaoPauloToday();

  const start = startOfDay(baseDate);
  const end = endOfDay(baseDate);

  const appointments = await prisma.appointment.findMany({
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
  });

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-title text-content-primary">Minha agenda</h2>
          <p className="text-paragraph-medium text-content-secondary">
            Veja os horários agendados para a data selecionada.
          </p>
        </div>

        <DatePicker />
      </header>

      {appointments.length === 0 ? (
        <p className="text-paragraph-medium text-content-secondary">
          Você não tem agendamentos para esta data.
        </p>
      ) : (
        <section className="space-y-3">
          {appointments.map((appt) => {
            const statusClass =
              appt.status === "PENDING"
                ? "bg-accent-yellow/15 text-accent-yellow border-accent-yellow"
                : appt.status === "DONE"
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                  : "bg-red-500/15 text-red-300 border-red-500/40";

            const statusLabel =
              appt.status === "PENDING"
                ? "Pendente"
                : appt.status === "DONE"
                  ? "Concluído"
                  : "Cancelado";

            return (
              <div
                key={appt.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-border-primary bg-background-tertiary px-4 py-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-paragraph-medium text-content-primary font-medium">
                      {appt.clientName}
                    </span>

                    {/* Badge padronizado igual ao admin */}

                    <AppointmentStatusBadge status={appt.status} />
                  </div>

                  <p className="text-paragraph-small text-content-secondary">
                    {appt.phone} • {appt.description}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-label-small font-mono text-content-primary">
                    {appt.scheduleAt.toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>

                  {appt.status === "PENDING" && (
                    <div className="flex gap-2">
                      <form action={markAppointmentDone}>
                        <input
                          type="hidden"
                          name="appointmentId"
                          value={appt.id}
                        />
                        <Button type="submit" size="sm" variant="active">
                          Concluir
                        </Button>
                      </form>

                      <form action={cancelAppointment}>
                        <input
                          type="hidden"
                          name="appointmentId"
                          value={appt.id}
                        />
                        <Button type="submit" size="sm" variant="outline">
                          Cancelar
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
