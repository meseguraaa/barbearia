// src/app/barber/calendar/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { startOfDay, endOfDay } from "date-fns";

import { prisma } from "@/lib/prisma";
import { getCurrentPainelUser } from "@/lib/painel-session";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { markAppointmentDone, cancelAppointment } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Barbeiro | Minha agenda",
};

async function getCurrentBarberScopeOrRedirect(): Promise<{
  barberId: string;
  companyId: string;
}> {
  const session = await getCurrentPainelUser();

  if (!session) redirect("/painel/login");
  if (session.role !== "BARBER") redirect("/painel/login?error=permissao");
  if (!session.companyId) redirect("/painel/login?error=missing_company");

  const barber = await prisma.barber.findUnique({
    where: { userId: session.sub },
    select: {
      id: true,
      // companyId pode existir no seu schema, mas aqui não é nossa fonte da verdade
      companyId: true,
    },
  });

  if (!barber) {
    // mantém UX semelhante ao que você tinha
    return { barberId: "", companyId: session.companyId };
  }

  return { barberId: barber.id, companyId: session.companyId };
}

export default async function BarberCalendarPage() {
  const { barberId, companyId } = await getCurrentBarberScopeOrRedirect();

  if (!barberId || !companyId) {
    return (
      <main className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Minha agenda</h1>
        <p className="text-sm text-muted-foreground">
          Sua conta ainda não está vinculada a um barbeiro (ou a uma empresa)
          cadastrada. Peça para um administrador associar seu usuário a um
          barbeiro na área administrativa.
        </p>
      </main>
    );
  }

  const today = new Date();
  const start = startOfDay(today);
  const end = endOfDay(today);

  // ✅ Multi-tenant REAL: companyId vem do token (tenant lock)
  const appointments = await prisma.appointment.findMany({
    where: {
      companyId,
      barberId,
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
                      <Button type="submit" size="sm" variant="destructive">
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
