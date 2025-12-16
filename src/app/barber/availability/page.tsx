import { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

import type { WeeklyAvailabilityState } from "@/components/weekly-availability-form/weekly-availability-form";

import { DailyExceptionModal } from "@/components/daily-exception-modal/daily-exception-modal";
import { DailyExceptionsList } from "@/components/daily-exceptions-list/daily-exceptions-list";
import { WeeklyAvailabilityClient } from "@/components/weekly-availability-client/weekly-availability-client";

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

async function getCurrentBarberAndUnitOrThrow() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) redirect("/painel/login");

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

  const activeBarberUnit = await prisma.barberUnit.findFirst({
    where: {
      barberId: barber.id,
      isActive: true,
    },
    select: { unitId: true },
    orderBy: { createdAt: "asc" },
  });

  if (!activeBarberUnit?.unitId) {
    throw new Error("Este profissional não possui unidade ativa vinculada.");
  }

  return { barber, unitId: activeBarberUnit.unitId, session: payload };
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Barbeiro | Disponibilidade",
};

function createDefaultWeeklyState(): WeeklyAvailabilityState {
  return {
    0: { active: false, startTime: "09:00", endTime: "21:00" }, // domingo
    1: { active: true, startTime: "10:00", endTime: "19:00" }, // segunda
    2: { active: true, startTime: "10:00", endTime: "19:00" }, // terça
    3: { active: true, startTime: "10:00", endTime: "19:00" }, // quarta
    4: { active: true, startTime: "10:00", endTime: "19:00" }, // quinta
    5: { active: true, startTime: "10:00", endTime: "19:00" }, // sexta
    6: { active: true, startTime: "09:00", endTime: "21:00" }, // sábado
  };
}

export default async function BarberAvailabilityPage() {
  const { barber, unitId } = await getCurrentBarberAndUnitOrThrow();

  const weeklyAvailabilities = await prisma.barberWeeklyAvailability.findMany({
    where: { barberId: barber.id, unitId },
    include: { intervals: true },
    orderBy: { weekday: "asc" },
  });

  const initialState: WeeklyAvailabilityState = createDefaultWeeklyState();

  for (const item of weeklyAvailabilities) {
    const weekday = item.weekday;
    if (weekday < 0 || weekday > 6) continue;

    const interval = item.intervals[0];

    if (!interval) {
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
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-title text-content-primary">Disponibilidade</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Defina seus horários disponíveis para receber agendamentos e crie
            exceções em dias específicos.
          </p>
        </div>
      </header>

      <section className="space-y-6">
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-4 space-y-3">
          <WeeklyAvailabilityClient
            initialValue={initialState}
            leftAction={<DailyExceptionModal barberId={barber.id} />}
          />
        </div>

        <DailyExceptionsList barberId={barber.id} />
      </section>
    </div>
  );
}
