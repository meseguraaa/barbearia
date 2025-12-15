import { getServerSession } from "next-auth";
import { nextAuthOptions } from "@/lib/nextauth";
import { redirect } from "next/navigation";

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
import { ClientAppointmentReviewDialog } from "@/components/client-appointment-review-dialog";

// força essa página a ser dinâmica (sem cache estático)
export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<{
    date?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const session = await getServerSession(nextAuthOptions);

  const userId = (session?.user as any)?.id as string | undefined;
  const userName = (session?.user as any)?.name ?? "Cliente";
  const userImage = (session?.user as any)?.image ?? "/default-avatar.png";

  // 🔐 Se não tiver usuário logado, manda pro login
  if (!userId) {
    redirect("/login");
  }

  // 🔎 Busca usuário pra ver role + perfil
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      phone: true,
      birthday: true,
    },
  });

  let shouldOpenProfileModal = false;

  if (dbUser && dbUser.role === "CLIENT") {
    const isMissingPhone = !dbUser.phone || dbUser.phone.trim() === "";
    const isMissingBirthday = !dbUser.birthday;

    shouldOpenProfileModal = isMissingPhone || isMissingBirthday;
  }

  // usado pra escolher o texto "primeira vez"
  const isFirstTimeProfile =
    dbUser?.role === "CLIENT" && shouldOpenProfileModal;

  // 🔎 Busca atendimento DONE mais recente, sem avaliação e sem modal mostrado ainda
  let pendingReviewAppointment: {
    id: string;
    scheduleAt: Date;
    barberName: string;
    serviceName: string;
  } | null = null;

  let reviewTags:
    | {
        id: string;
        label: string;
      }[]
    | [] = [];

  if (dbUser?.role === "CLIENT") {
    const appointment = await prisma.appointment.findFirst({
      where: {
        clientId: userId,
        status: "DONE",
        reviewModalShown: false,
        review: {
          is: null,
        },
      },
      orderBy: {
        scheduleAt: "desc",
      },
      include: {
        barber: true,
        service: true,
      },
    });

    if (appointment) {
      pendingReviewAppointment = {
        id: appointment.id,
        scheduleAt: appointment.scheduleAt,
        barberName: appointment.barber?.name ?? "Profissional",
        serviceName: appointment.service?.name ?? "Atendimento",
      };

      // 🔹 Só buscamos as tags se realmente houver avaliação pendente
      reviewTags = await prisma.reviewTag.findMany({
        where: {
          isActive: true,
        },
        orderBy: {
          label: "asc",
        },
        select: {
          id: true,
          label: true,
        },
      });
    }
  }

  // 🔓 Só abrimos o modal de avaliação automaticamente se:
  // - for cliente
  // - tiver atendimento pendente de avaliação
  // - e NÃO estiver abrindo o modal de perfil (prioridade para o perfil)
  const shouldOpenReviewModal =
    !!pendingReviewAppointment && !shouldOpenProfileModal;

  const resolvedSearchParams = await searchParams;
  const dateParam = resolvedSearchParams.date;

  const baseDate = (() => {
    if (!dateParam) return new Date();

    const [year, month, day] = dateParam.split("-").map(Number);
    return new Date(year, month - 1, day);
  })();

  const dayStart = startOfDay(baseDate);
  const dayEnd = endOfDay(baseDate);

  // ✅ Unidades ativas (pra Combo do Item B)
  const unitsPrisma = await prisma.unit.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, isActive: true },
  });

  const units = unitsPrisma.map((u) => ({
    id: u.id,
    name: u.name,
    isActive: u.isActive,
  }));

  const rawAppointments = await prisma.appointment.findMany({
    where: {
      clientId: userId, // ✅ AQUI É A TRAVA: só agendamentos do cliente logado
      scheduleAt: {
        gte: dayStart,
        lte: dayEnd,
      },
      status: {
        not: "CANCELED",
      },
    },
    orderBy: {
      scheduleAt: "asc",
    },
    include: {
      barber: {
        include: {
          user: true,
        },
      },
    },
  });

  // 🔹 barbeiros ativos vindos do model Barber
  //    incluindo serviços que fazem + vínculos de unidade (BarberUnit)
  const barbersPrisma = await prisma.barber.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: {
      services: {
        select: {
          serviceId: true,
        },
      },
      units: {
        where: { isActive: true },
        select: { unitId: true },
      },
    },
  });

  const barbers: Barber[] = barbersPrisma.map((barber) => ({
    id: barber.id,
    name: barber.name,
    email: barber.email,
    phone: barber.phone,
    isActive: barber.isActive,
    role: "BARBER",
  }));

  // ✅ serviços ativos (NÃO mandamos unitId pro form,
  // porque no seu negócio "serviço é ligado ao profissional", e o form filtrava errado)
  const servicesPrisma = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      price: true,
      durationMinutes: true,
      isActive: true,
    },
  });

  const services: Service[] = servicesPrisma.map((service) => ({
    id: service.id,
    name: service.name,
    price: Number(service.price),
    durationMinutes: service.durationMinutes,
    isActive: service.isActive,
  }));

  const now = new Date();

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

    const status = apt.status ?? "PENDING";

    // 🔐 travar ações quando o horário chegou ou passou
    const isLocked = apt.scheduleAt <= now;

    return {
      id: apt.id,
      clientName: apt.clientName,
      phone: apt.phone,
      description: apt.description,
      scheduleAt: apt.scheduleAt,
      status,
      barberId: apt.barberId ?? "",
      barber: apt.barber
        ? {
            id: apt.barber.id,
            name: apt.barber.name,
            email: apt.barber.email,
            phone: barberData?.phone ?? null,
            isActive: barberData?.isActive ?? true,
            role: "BARBER",
            user: apt.barber.user
              ? {
                  image: apt.barber.user.image,
                }
              : undefined,
          }
        : undefined,
      time,
      period,
      isLocked,
    } as AppointmentType & { isLocked: boolean };
  });

  const periods = groupAppointmentByPeriod(appointments);

  // 🔹 Array específico para o AppointmentForm:
  //    manda serviceIds + unitIds (vínculos do profissional)
  const barbersForForm = barbersPrisma.map((barber) => ({
    id: barber.id,
    name: barber.name ?? "Barbeiro",
    email: barber.email,
    phone: barber.phone ?? "",
    isActive: barber.isActive ?? true,
    role: "BARBER" as const,
    serviceIds: barber.services.map((s) => s.serviceId),
    unitIds: barber.units.map((u) => u.unitId),
  }));

  // 🔹 Plano ativo do cliente logado (para o AppointmentForm)
  let clientPlanForForm: {
    planId: string;
    planName: string;
    status: "ACTIVE" | "EXPIRED" | "CANCELED";
    usedBookings: number;
    totalBookings: number;
    endDate: Date;
    serviceIds: string[];
  } | null = null;

  if (userId) {
    const clientPlans = await prisma.clientPlan.findMany({
      where: { clientId: userId },
      orderBy: { startDate: "desc" },
      include: {
        plan: {
          include: {
            services: true,
          },
        },
      },
    });

    const today = new Date();

    const activePlan = clientPlans.find((cp) => {
      const hasCredits = cp.usedBookings < cp.plan.totalBookings;
      const isActive = cp.status === "ACTIVE";
      const isWithinValidity = cp.endDate >= today;

      return hasCredits && isActive && isWithinValidity;
    });

    if (activePlan) {
      clientPlanForForm = {
        planId: activePlan.id,
        planName: activePlan.plan.name,
        status: activePlan.status as "ACTIVE" | "EXPIRED" | "CANCELED",
        usedBookings: activePlan.usedBookings,
        totalBookings: activePlan.plan.totalBookings,
        endDate: activePlan.endDate,
        serviceIds: activePlan.plan.services.map((s) => s.serviceId),
      };
    }
  }

  return (
    <div className="bg-background-primary min-h-screen p-6">
      <div className="max-w-5xl mx-auto">
        {/* HEADER DO CLIENTE */}
        <header className="flex items-start justify-between mb-8">
          <div>
            <p className="text-content-secondary">Olá,</p>
            <p className="text-title-size text-content-primary">{userName}</p>
          </div>

          <div className="flex items-center gap-3">
            {pendingReviewAppointment && (
              <ClientAppointmentReviewDialog
                defaultOpen={shouldOpenReviewModal}
                appointment={{
                  id: pendingReviewAppointment.id,
                  barberName: pendingReviewAppointment.barberName,
                  serviceName: pendingReviewAppointment.serviceName,
                  scheduleAt: pendingReviewAppointment.scheduleAt,
                }}
                tags={reviewTags}
              />
            )}

            <ClientProfileDialog
              userName={userName}
              userImage={userImage}
              defaultOpen={shouldOpenProfileModal}
              isFirstTime={isFirstTimeProfile}
            />
          </div>
        </header>

        {/* TÍTULO DA AGENDA */}
        <div className="flex items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-title-size text-content-primary mb-2">
              Sua Agenda
            </h1>
            <p className="text-content-secondary">
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
          barbers={barbersForForm as any}
          services={services as any}
          units={units}
          defaultClientName={userName}
          clientPlan={clientPlanForForm}
        >
          <Button variant="brand">Novo Agendamento</Button>
        </AppointmentForm>
      </div>
    </div>
  );
}
