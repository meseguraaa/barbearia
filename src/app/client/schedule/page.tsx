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
import { ClientUnitSwitcher } from "@/components/client-unit-switcher";

// força essa página a ser dinâmica (sem cache estático)
export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<{
    date?: string;
    unit?: string; // ✅ unidade selecionada no topo (SEM "all")
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const session = await getServerSession(nextAuthOptions);

  const userId = (session?.user as any)?.id as string | undefined;
  const userName = (session?.user as any)?.name ?? "Cliente";
  const userImage = (session?.user as any)?.image ?? "/default-avatar.png";

  if (!userId) redirect("/login");

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, phone: true, birthday: true },
  });

  let shouldOpenProfileModal = false;

  if (dbUser && dbUser.role === "CLIENT") {
    const isMissingPhone = !dbUser.phone || dbUser.phone.trim() === "";
    const isMissingBirthday = !dbUser.birthday;
    shouldOpenProfileModal = isMissingPhone || isMissingBirthday;
  }

  const isFirstTimeProfile =
    dbUser?.role === "CLIENT" && shouldOpenProfileModal;

  // ===== review pendente =====
  let pendingReviewAppointment: {
    id: string;
    scheduleAt: Date;
    barberName: string;
    serviceName: string;
  } | null = null;

  let reviewTags: { id: string; label: string }[] | [] = [];

  if (dbUser?.role === "CLIENT") {
    const appointment = await prisma.appointment.findFirst({
      where: {
        clientId: userId,
        status: "DONE",
        reviewModalShown: false,
        review: { is: null },
      },
      orderBy: { scheduleAt: "desc" },
      include: { barber: true, service: true },
    });

    if (appointment) {
      pendingReviewAppointment = {
        id: appointment.id,
        scheduleAt: appointment.scheduleAt,
        barberName: appointment.barber?.name ?? "Profissional",
        serviceName: appointment.service?.name ?? "Atendimento",
      };

      reviewTags = await prisma.reviewTag.findMany({
        where: { isActive: true },
        orderBy: { label: "asc" },
        select: { id: true, label: true },
      });
    }
  }

  const shouldOpenReviewModal =
    !!pendingReviewAppointment && !shouldOpenProfileModal;

  const resolvedSearchParams = await searchParams;
  const dateParam = resolvedSearchParams.date;
  const unitParam = resolvedSearchParams.unit;

  const baseDate = (() => {
    if (!dateParam) return new Date();
    const [year, month, day] = dateParam.split("-").map(Number);
    return new Date(year, month - 1, day);
  })();

  const dayStart = startOfDay(baseDate);
  const dayEnd = endOfDay(baseDate);

  // ✅ Unidades ativas (SEM opção "todas")
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

  // ✅ escolhe unidade: se tiver 1, usa ela; senão, usa param válido ou primeira
  const selectedUnitId = (() => {
    if (units.length === 0) return "";
    if (units.length === 1) return units[0].id;

    const isValidParam = !!unitParam && units.some((u) => u.id === unitParam);
    return isValidParam ? (unitParam as string) : units[0].id;
  })();

  const selectedUnitName =
    units.find((u) => u.id === selectedUnitId)?.name ?? "Unidade";

  // ✅ appointments do cliente + do dia + da unidade selecionada
  const rawAppointments = await prisma.appointment.findMany({
    where: {
      clientId: userId,
      unitId: selectedUnitId, // ✅ AQUI: filtra pela unidade do topo
      scheduleAt: { gte: dayStart, lte: dayEnd },
      status: { not: "CANCELED" },
    },
    orderBy: { scheduleAt: "asc" },
    include: {
      barber: { include: { user: true } },
    },
  });

  // ===== barbeiros =====
  const barbersPrisma = await prisma.barber.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: {
      services: { select: { serviceId: true } },
      units: { where: { isActive: true }, select: { unitId: true } },
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

  // ===== serviços =====
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
              ? { image: apt.barber.user.image }
              : undefined,
          }
        : undefined,
      time,
      period,
      isLocked,
    } as AppointmentType & { isLocked: boolean };
  });

  const periods = groupAppointmentByPeriod(appointments);

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

  // ===== plano do cliente =====
  let clientPlanForForm: {
    planId: string;
    planName: string;
    status: "ACTIVE" | "EXPIRED" | "CANCELED";
    usedBookings: number;
    totalBookings: number;
    endDate: Date;
    serviceIds: string[];
  } | null = null;

  {
    const clientPlans = await prisma.clientPlan.findMany({
      where: { clientId: userId },
      orderBy: { startDate: "desc" },
      include: {
        plan: { include: { services: true } },
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

        {/* TÍTULO DA AGENDA + UNIDADE */}
        <div className="flex items-center justify-between mb-8 gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-title-size text-content-primary mb-2">
                Agenda -
              </h1>

              {units.length <= 1 ? (
                <div className="text-title text-content-primary mb-2">
                  {selectedUnitName}
                </div>
              ) : (
                <div className="mb-2">
                  <ClientUnitSwitcher
                    units={units}
                    selectedUnitId={selectedUnitId}
                  />
                </div>
              )}
            </div>

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
          // ✅ recomendado: faz o modal já “nascer” na unidade do topo
          defaultUnitId={selectedUnitId as any}
        >
          <Button variant="brand">Novo Agendamento</Button>
        </AppointmentForm>
      </div>
    </div>
  );
}
