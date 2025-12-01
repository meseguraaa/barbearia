import Link from "next/link";
import { getServerSession } from "next-auth";
import { nextAuthOptions } from "@/lib/nextauth";

import { AppointmentForm } from "@/components/appointment-form";
import { DatePicker } from "@/components/date-picker";
import { PeriodSection } from "@/components/period-section/period-section";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { groupAppointmentByPeriod } from "@/utills/appoitment-utills";
import { endOfDay, startOfDay } from "date-fns";
import type { Appointment as AppointmentType } from "@/types/appointment";
import type { Barber } from "@/types/barber";
import type { Service } from "@/types/service";
import { ClientProfileDialog } from "@/components/client-profile-dialog";

// força essa página a ser dinâmica (sem cache estático)
export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<{
    date?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const session = await getServerSession(nextAuthOptions);

  const userName = (session?.user as any)?.name ?? "Cliente";
  const userImage = (session?.user as any)?.image ?? "/default-avatar.png";

  const resolvedSearchParams = await searchParams;
  const dateParam = resolvedSearchParams.date;

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
      // 👇 REGRA DE BACKEND: na agenda do barbeiro
      // não exibimos agendamentos cancelados
      status: {
        not: "CANCELED",
      },
    },
    orderBy: {
      scheduleAt: "asc",
    },
    include: {
      // agora é o model Barber, não mais User
      barber: true,
    },
  });

  // barbeiros ativos vindos do model Barber
  const barbersPrisma = await prisma.barber.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  const barbers: Barber[] = barbersPrisma.map((barber) => ({
    id: barber.id,
    name: barber.name,
    email: barber.email,
    phone: barber.phone,
    isActive: barber.isActive,
    role: "BARBER",
  }));

  // serviços ativos vindos do model Service
  const servicesPrisma = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  const services: Service[] = servicesPrisma.map((service) => ({
    id: service.id,
    name: service.name,
    price: Number(service.price),
    durationMinutes: service.durationMinutes,
    isActive: service.isActive,
  }));

  const appointments: AppointmentType[] = rawAppointments.map((apt) => {
    const time = apt.scheduleAt.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const hour = apt.scheduleAt.getHours();
    const period =
      hour < 12
        ? ("morning" as const)
        : hour < 18
          ? ("afternoon" as const)
          : ("evening" as const);

    const barberData = barbers.find((b) => b.id === apt.barberId);

    return {
      id: apt.id,
      clientName: apt.clientName,
      phone: apt.phone,
      description: apt.description,
      scheduleAt: apt.scheduleAt,
      status: apt.status ?? "PENDING",
      barberId: apt.barberId ?? "",
      barber: apt.barber
        ? {
            id: apt.barber.id,
            name: apt.barber.name,
            email: apt.barber.email,
            phone: barberData?.phone ?? null,
            isActive: barberData?.isActive ?? true,
            role: "BARBER",
          }
        : undefined,
      time,
      period,
    };
  });

  const periods = groupAppointmentByPeriod(appointments);

  // Array específico para o AppointmentForm: garante name/phone como string
  const barbersForForm = barbers.map((barber) => ({
    id: barber.id,
    name: barber.name ?? "Barbeiro",
    email: barber.email,
    phone: barber.phone ?? "",
    isActive: barber.isActive ?? true,
    role: "BARBER" as const,
  }));

  return (
    <div className="bg-background-primary min-h-screen p-6">
      <div className="max-w-5xl mx-auto">
        {/* HEADER DO CLIENTE */}
        <header className="flex items-start justify-between mb-8">
          <div>
            <p className="text-paragraph-small-size text-content-secondary">
              Olá,
            </p>
            <p className="text-title-size text-content-primary">{userName}</p>
          </div>

          {/* Agora o trigger abre o modal de perfil */}
          <ClientProfileDialog userName={userName} userImage={userImage} />
        </header>

        {/* TÍTULO DA AGENDA */}
        <div className="flex items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-title-size text-content-primary mb-2">
              Sua Agenda
            </h1>
            <p className="text-paragraph-medium-size text-content-secondary">
              Selecione o serviço, a data e o horário para fazer seu
              agendamento.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <DatePicker />
          </div>
        </div>

        <div className="mt-3 mb-8 md:hidden">
          <DatePicker />
        </div>

        {/* LISTA DE PERÍODOS */}
        <div className="pb-24 md:pb-0">
          {periods.map((period, index) => (
            <PeriodSection
              key={index}
              period={period}
              barbers={barbers}
              services={services}
            />
          ))}
        </div>
      </div>

      {/* BOTÃO FIXO DE AGENDAMENTO */}
      <div
        className="
          fixed bottom-0 left-0 right-0 flex justify-center
          bg-[#333333] py-[18px] px-6
        "
      >
        <AppointmentForm
          appointments={appointments}
          barbers={barbersForForm}
          services={services}
        >
          <Button variant="brand">Novo Agendamento</Button>
        </AppointmentForm>
      </div>
    </div>
  );
}
