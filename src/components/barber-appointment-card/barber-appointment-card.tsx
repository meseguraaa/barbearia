// components/barber-appointment-card/barber-appointment-card.tsx
"use client";

import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { AppointmentForm } from "@/components/appointment-form";
import { AppointmentActions } from "@/components/appointment-actions";

import type { Appointment as AppointmentType } from "@/types/appointment";
import type { Service } from "@/types/service";

// Tipo específico para o dashboard do barbeiro
export type BarberDashboardAppointment = {
  id: string;
  clientName: string | null;
  phone: string | null;
  description: string | null;
  scheduleAt: Date;
  status: AppointmentType["status"] | null;
  barberId: string | null;
  barber?: {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
    isActive: boolean | null;
  } | null;
  serviceId?: string | null;
  service?: {
    price: number | bigint;
    cancelFeePercentage: number | bigint | null;
    cancelLimitHours: number | null;
  } | null;
  client?: {
    image: string | null;
  } | null;
  cancelFeeApplied?: boolean | null;
  // 👇 agora aceita também "CLIENT"
  cancelledByRole?: "ADMIN" | "BARBER" | "CLIENT" | null;
  concludedByRole?: "ADMIN" | "BARBER" | "CLIENT" | null;
  servicePriceAtTheTime?: number | bigint | null;

  // 🔹 infos de plano para o card
  isPlanCredit?: boolean;
  planCreditIndex?: number | null;
  planTotalCredits?: number | null;
};

type BarberAppointmentCardProps = {
  appointment: BarberDashboardAppointment;
  appointmentForForm?: AppointmentType;
  appointmentsForForm: AppointmentType[];
  barbersForForm: any[]; // mantemos flexível pro AppointmentForm
  services: Service[];
  barberName: string;
};

export function BarberAppointmentCard({
  appointment,
  appointmentForForm,
  appointmentsForForm,
  barbersForForm,
  services,
  barberName,
}: BarberAppointmentCardProps) {
  const timeStr = appointment.scheduleAt.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const priceSnapshot = appointment.servicePriceAtTheTime;
  const servicePrice = appointment.service?.price ?? 0;

  const servicePriceNumber = priceSnapshot
    ? Number(priceSnapshot)
    : Number(servicePrice);

  const normalizedStatus: AppointmentType["status"] =
    (appointment.status as AppointmentType["status"]) ?? "PENDING";

  const isPending = normalizedStatus === "PENDING";

  const apptForForm =
    appointmentForForm ??
    appointmentsForForm.find((a) => a.id === appointment.id);

  const safeApptForForm =
    apptForForm ??
    ({
      id: appointment.id,
      clientName: appointment.clientName ?? "",
      phone: appointment.phone ?? "",
      description: appointment.description ?? "",
      scheduleAt: appointment.scheduleAt,
      status: normalizedStatus,
      barberId: appointment.barberId ?? "",
      barber: appointment.barber
        ? {
            id: appointment.barber.id,
            name: appointment.barber.name,
            email: appointment.barber.email,
            phone: appointment.barber.phone ?? "",
            isActive: appointment.barber.isActive ?? true,
            role: "BARBER" as const,
          }
        : undefined,
      serviceId: appointment.serviceId ?? undefined,
    } as AppointmentType);

  const clientImage = appointment.client?.image ?? null;
  const safeClientName = appointment.clientName ?? "";
  const clientInitial = safeClientName[0]?.toUpperCase() ?? "?";

  // MINI LOG (mesma regra do admin, agora incluindo CLIENTE)
  let actionLog = "—";

  if (appointment.status === "DONE") {
    if (appointment.concludedByRole === "ADMIN") {
      actionLog = "Concluído pelo ADMIN";
    } else if (appointment.concludedByRole === "BARBER") {
      actionLog = "Concluído pelo Barbeiro";
    } else if (appointment.concludedByRole === "CLIENT") {
      actionLog = "Concluído pelo Cliente";
    } else {
      actionLog = "Concluído";
    }
  } else if (appointment.status === "CANCELED") {
    let who: string | null = null;

    if (appointment.cancelledByRole === "ADMIN") {
      who = "ADMIN";
    } else if (appointment.cancelledByRole === "BARBER") {
      who = "Barbeiro";
    } else if (appointment.cancelledByRole === "CLIENT") {
      who = "Cliente";
    }

    if (appointment.cancelFeeApplied) {
      if (who) {
        actionLog = `Cancelado pelo ${who} - com taxa`;
      } else {
        actionLog = "Cancelado - com taxa";
      }
    } else {
      if (who) {
        actionLog = `Cancelado pelo ${who} - sem taxa`;
      } else {
        actionLog = "Cancelado - sem taxa";
      }
    }
  }

  return (
    <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3">
      <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Infos do agendamento */}
        <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-6 md:items-center">
          {/* Nome + avatar */}
          <div>
            <div className="flex items-center gap-3">
              {clientImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={clientImage}
                  alt={safeClientName}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-background-secondary flex items-center justify-center text-xs font-medium text-content-secondary">
                  {clientInitial}
                </div>
              )}

              <span className="text-paragraph-medium text-content-primary font-medium">
                {safeClientName}
              </span>
            </div>
          </div>

          {/* Telefone */}
          <div className="text-paragraph-medium text-content-primary">
            {appointment.phone ?? ""}
          </div>

          {/* Descrição */}
          <div className="text-paragraph-medium text-content-primary">
            {appointment.description ?? ""}
          </div>

          {/* Status */}
          <div className="flex md:justify-center">
            <AppointmentStatusBadge status={normalizedStatus} />
          </div>

          {/* Log */}
          <div className="text-paragraph-small text-content-secondary md:text-center">
            {actionLog}
          </div>

          {/* Horário */}
          <div className="text-paragraph-medium text-content-primary md:text-center">
            {timeStr}
          </div>
        </div>

        {/* Ações */}
        <div className="flex flex-wrap justify-end gap-2 md:flex-nowrap md:min-w-[260px]">
          {isPending && (
            <>
              <AppointmentForm
                appointment={safeApptForForm}
                appointments={appointmentsForForm}
                barbers={barbersForForm}
                services={services}
              />

              <AppointmentActions
                appointmentId={appointment.id}
                status={normalizedStatus}
                clientName={appointment.clientName ?? ""}
                phone={appointment.phone ?? ""}
                description={appointment.description ?? ""}
                scheduleAt={appointment.scheduleAt}
                barberName={barberName ?? ""}
                servicePrice={servicePriceNumber}
                cancelFeePercentage={
                  appointment.service?.cancelFeePercentage != null
                    ? Number(appointment.service.cancelFeePercentage)
                    : undefined
                }
                cancelLimitHours={
                  appointment.service?.cancelLimitHours ?? undefined
                }
                cancelledByRole="BARBER"
                concludedByRole="BARBER"
                // 🔹 infos de plano para o modal "Conferir"
                isPlanCredit={appointment.isPlanCredit}
                planCreditIndex={appointment.planCreditIndex}
                planTotalCredits={appointment.planTotalCredits}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
