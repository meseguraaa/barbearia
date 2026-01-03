// src/app/barber/availability/page.tsx
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentPainelUser } from "@/lib/painel-session";

import type { WeeklyAvailabilityState } from "@/components/weekly-availability-form/weekly-availability-form";

import { DailyExceptionModal } from "@/components/daily-exception-modal/daily-exception-modal";
import { DailyExceptionsList } from "@/components/daily-exceptions-list/daily-exceptions-list";
import { WeeklyAvailabilityClient } from "@/components/weekly-availability-client/weekly-availability-client";

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

/**
 * Fonte da verdade do escopo:
 * - sessão (painel_session) => companyId + userId
 * - barber => por userId
 * - unidade ativa => dentro da companyId da sessão
 */
async function getCurrentBarberScopeOrRedirect(): Promise<{
  barberId: string;
  companyId: string;
  unitId: string;
}> {
  const session = await getCurrentPainelUser();

  if (!session) redirect("/painel/login");
  if (session.role !== "BARBER") redirect("/painel/login?error=permissao");
  if (!session.companyId) redirect("/painel/login?error=missing_company");

  // ✅ Barber vinculado ao usuário logado (userId do token)
  const barber = await prisma.barber.findUnique({
    where: { userId: session.sub },
    select: { id: true },
  });

  if (!barber) {
    // mantém mensagem amigável como antes, mas via redirect/erro controlado
    throw new Error("Barber não encontrado para o usuário logado.");
  }

  // ✅ Unidade ativa do barbeiro, mas AGORA dentro da companyId da sessão (tenant lock)
  const active = await prisma.barberUnit.findFirst({
    where: {
      barberId: barber.id,
      isActive: true,
      unit: {
        isActive: true,
        companyId: session.companyId,
      },
    },
    select: {
      unit: { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const unitId = active?.unit?.id;

  if (!unitId) {
    throw new Error("Este profissional não possui unidade ativa vinculada.");
  }

  return {
    barberId: barber.id,
    companyId: session.companyId,
    unitId,
  };
}

export default async function BarberAvailabilityPage() {
  const { barberId, unitId, companyId } =
    await getCurrentBarberScopeOrRedirect();

  const weeklyAvailabilities = await prisma.barberWeeklyAvailability.findMany({
    where: {
      barberId,
      unitId,
      companyId, // ✅ tenant lock (agora vem do token)
    },
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
            leftAction={<DailyExceptionModal barberId={barberId} />}
          />
        </div>

        <DailyExceptionsList barberId={barberId} />
      </section>
    </div>
  );
}
