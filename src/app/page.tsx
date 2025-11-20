import { AppointmentForm } from "@/components/appointment-form";
import { DatePicker } from "@/components/date-picker";
import { PeriodSection } from "@/components/period-section/period-section";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { groupAppointmentByPeriod } from "@/utills/appoitment-utills";
import { endOfDay, startOfDay } from "date-fns";

// força essa página a ser dinâmica (sem cache estático)
export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<{
    date?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  // 👉 searchParams agora é uma Promise, então precisamos dar await
  const resolvedSearchParams = await searchParams;
  const dateParam = resolvedSearchParams.date;

  // Data base vinda da URL (?date=yyyy-MM-dd) ou hoje
  const baseDate = (() => {
    if (!dateParam) return new Date();

    const [year, month, day] = dateParam.split("-").map(Number);
    return new Date(year, month - 1, day);
  })();

  const dayStart = startOfDay(baseDate);
  const dayEnd = endOfDay(baseDate);

  const rawAppointments = await prisma.appointment.findMany({
    where: {
      scheduleAt: {
        gte: dayStart,
        lte: dayEnd,
      },
    },
    orderBy: {
      scheduleAt: "asc",
    },
  });

  const appointments = rawAppointments.map((apt) => ({
    ...apt,
    time: apt.scheduleAt.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    period:
      apt.scheduleAt.getHours() < 12
        ? ("morning" as const)
        : apt.scheduleAt.getHours() < 18
          ? ("afternoon" as const)
          : ("evening" as const),
  }));

  const periods = groupAppointmentByPeriod(appointments);

  return (
    <div className="bg-background-primary p-6">
      <div className="flex items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-title-size text-content-primary mb-2">
            Sua Agenda
          </h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Aqui você pode ver todos os clientes e serviços agendados para hoje.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-4">
          <DatePicker />
        </div>
      </div>

      <div className="mt-3 mb-8 md:hidden">
        <DatePicker />
      </div>

      <div className="pb-24 md:pb-0">
        {periods.map((period, index) => (
          <PeriodSection period={period} key={index} />
        ))}
      </div>

      <div
        className="
          fixed bottom-0 left-0 right-0 flex justify-center
          bg-[#333333] py-[18px] px-6
        "
      >
        {/* 🔥 Agora o formulário de NOVO agendamento recebe todos os agendamentos do dia */}
        <AppointmentForm appointments={appointments}>
          <Button variant="brand">Agendar</Button>
        </AppointmentForm>
      </div>
    </div>
  );
}
