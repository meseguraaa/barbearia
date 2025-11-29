// app/barber/availability/page.tsx
import { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { WeeklyAvailabilityForm } from "@/components/weekly-availability-form/weekly-availability-form";
import type { WeeklyAvailabilityState } from "@/components/weekly-availability-form/weekly-availability-form";
import { DailyExceptionModal } from "./daily-exception-modal";
import { DailyExceptionsList } from "./daily-exceptions-list";

const SESSION_COOKIE_NAME = "painel_session";

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

async function getCurrentBarberOrThrow() {
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

  if (!barber) {
    throw new Error("Barber não encontrado para o usuário logado.");
  }

  return { barber, session: payload };
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Barbeiro | Disponibilidade",
};

// helper para criar o default (segunda–sábado ON, domingo OFF)
function createDefaultWeeklyState(): WeeklyAvailabilityState {
  return {
    0: { active: false, startTime: "09:00", endTime: "18:00" }, // domingo
    1: { active: true, startTime: "09:00", endTime: "18:00" }, // segunda
    2: { active: true, startTime: "09:00", endTime: "18:00" }, // terça
    3: { active: true, startTime: "09:00", endTime: "18:00" }, // quarta
    4: { active: true, startTime: "09:00", endTime: "18:00" }, // quinta
    5: { active: true, startTime: "09:00", endTime: "18:00" }, // sexta
    6: { active: true, startTime: "09:00", endTime: "18:00" }, // sábado
  };
}

export default async function BarberAvailabilityPage() {
  const { barber } = await getCurrentBarberOrThrow();

  // Busca padrão semanal salvo no banco para o barbeiro logado
  const weeklyAvailabilities = await prisma.barberWeeklyAvailability.findMany({
    where: { barberId: barber.id },
    include: {
      intervals: true,
    },
    orderBy: {
      weekday: "asc",
    },
  });

  // Começa com o default (segunda–sábado on, domingo off)
  const initialState: WeeklyAvailabilityState = createDefaultWeeklyState();

  // Aplica o que veio do banco em cima do default
  for (const item of weeklyAvailabilities) {
    const weekday = item.weekday; // 0–6
    if (weekday < 0 || weekday > 6) continue;

    const interval = item.intervals[0]; // por enquanto usamos só 1 intervalo
    if (!interval) {
      // se não tiver intervalo, só controla o active
      initialState[weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6].active = item.isActive;
      continue;
    }

    initialState[weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6] = {
      active: item.isActive,
      startTime: interval.startTime,
      endTime: interval.endTime,
    };
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-title text-content-primary">Disponibilidade</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Defina seus horários disponíveis para receber agendamentos e crie
            exceções em dias específicos.
          </p>
        </div>

        <DailyExceptionModal barberId={barber.id} />
      </header>

      {/* CONTEÚDO PRINCIPAL */}
      <section className="space-y-6">
        {/* PADRÃO SEMANAL */}
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-4 space-y-3">
          <div>
            <h2 className="text-paragraph-large-size text-content-primary font-semibold">
              Padrão semanal
            </h2>
            <p className="text-paragraph-small-size text-content-secondary">
              Configure como normalmente funciona sua semana de trabalho.
            </p>
          </div>

          <WeeklyAvailabilityForm initialValue={initialState} />
        </div>

        {/* EXCEÇÕES POR DIA */}
        <DailyExceptionsList barberId={barber.id} />
      </section>
    </div>
  );
}
