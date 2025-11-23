// app/barber/dashboard/page.tsx
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { Metadata } from "next";
import { startOfDay, endOfDay } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  // Tenta vincular pelo userId (quando houver) ou pelo e-mail
  const barber = await prisma.barber.findUnique({
    where: { email: payload.email },
  });

  return { barber, session: payload };
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Barbeiro | Minha agenda",
};

export default async function BarberDashboardPage() {
  const { barber } = await getCurrentBarber();

  // Se não achou um registro de Barber ligado a esse usuário
  if (!barber) {
    return (
      <main className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Minha agenda</h1>
        <p className="text-sm text-muted-foreground">
          Sua conta ainda não está vinculada a um barbeiro cadastrado. Peça para
          um administrador associar seu usuário a um barbeiro na área
          administrativa.
        </p>
      </main>
    );
  }

  const today = new Date();
  const start = startOfDay(today);
  const end = endOfDay(today);

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
    <main className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Minha agenda de hoje
        </h1>
        <p className="text-sm text-muted-foreground">
          Veja os horários agendados para hoje.
        </p>
      </header>

      {appointments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Você não tem agendamentos para hoje.
        </p>
      ) : (
        <section className="space-y-3">
          {appointments.map((appt) => (
            <div
              key={appt.id}
              className="flex items-center justify-between gap-4 rounded-md border p-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{appt.clientName}</span>

                  <Badge variant="outline">
                    {appt.status === "PENDING"
                      ? "Pendente"
                      : appt.status === "DONE"
                        ? "Concluído"
                        : "Cancelado"}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground">
                  {appt.phone} • {appt.description}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-sm font-mono">
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
                      <Button type="submit" size="sm" variant="outline">
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
          ))}
        </section>
      )}
    </main>
  );
}
