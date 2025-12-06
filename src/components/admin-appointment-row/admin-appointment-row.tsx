import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { AppointmentForm } from "@/components/appointment-form";
import { AppointmentActions } from "@/components/appointment-actions";
import type { Appointment as AppointmentType } from "@/types/appointment";
import type { Service } from "@/types/service";

type BarberForForm = {
  id: string;
  name: string; // sempre string
  email: string; // sempre string
  phone: string;
  isActive: boolean;
  role: "BARBER";
};

type AdminAppointmentRowProps = {
  appt: any; // Prisma appointment com relations
  appointmentsForForm: AppointmentType[];
  barbersForForm: BarberForForm[];
  services: Service[];

  // 🔹 infos de plano por agendamento (opcionais)
  isPlanCredit?: boolean;
  planCreditIndex?: number | null;
  planTotalCredits?: number | null;
};

export function AdminAppointmentRow({
  appt,
  appointmentsForForm,
  barbersForForm,
  services,
  isPlanCredit,
  planCreditIndex,
  planTotalCredits,
}: AdminAppointmentRowProps) {
  const date = new Date(appt.scheduleAt);
  const dateStr = format(date, "dd/MM/yyyy", { locale: ptBR });
  const timeStr = format(date, "HH:mm", { locale: ptBR });

  const apptForForm = appointmentsForForm.find((a) => a.id === appt.id);

  const normalizedStatus =
    (appt.status as AppointmentType["status"]) ?? "PENDING";
  const isPending = normalizedStatus === "PENDING";

  const safeApptForForm: AppointmentType = apptForForm ?? {
    id: appt.id,
    clientName: appt.clientName,
    phone: appt.phone,
    description: appt.description,
    scheduleAt: appt.scheduleAt,
    status: normalizedStatus,
    barberId: appt.barberId ?? "",
    barber: appt.barber
      ? {
          id: appt.barber.id,
          name: appt.barber.name ?? "", // garante string
          email: appt.barber.email ?? "", // garante string
          phone: appt.barber.phone,
          isActive: appt.barber.isActive,
          role: "BARBER",
        }
      : undefined,
    serviceId: appt.serviceId ?? undefined,
  };

  // avatar do cliente
  const clientImage = appt.client?.image ?? null;
  const clientInitial = appt.clientName?.[0]?.toUpperCase() ?? "?";

  let actionLog = "—";

  if (appt.status === "DONE") {
    if (appt.concludedByRole === "ADMIN") {
      actionLog = "Concluído pelo ADMIN";
    } else if (appt.concludedByRole === "BARBER") {
      actionLog = "Concluído pelo Barbeiro";
    } else {
      actionLog = "Concluído";
    }
  } else if (appt.status === "CANCELED") {
    const hasFee = appt.cancelFeeApplied;
    const who =
      appt.cancelledByRole === "ADMIN"
        ? "ADMIN"
        : appt.cancelledByRole === "BARBER"
          ? "Barbeiro"
          : null;

    if (who === "ADMIN") {
      actionLog = hasFee
        ? "Cancelado pelo ADMIN - com taxa"
        : "Cancelado pelo ADMIN - sem taxa";
    } else if (who === "Barbeiro") {
      actionLog = hasFee
        ? "Cancelado pelo Barbeiro - com taxa"
        : "Cancelado pelo Barbeiro - sem taxa";
    } else {
      actionLog = hasFee ? "Cancelado - com taxa" : "Cancelado - sem taxa";
    }
  }

  return (
    <tr className="border-b border-border-primary hover:bg-muted/30">
      {/* avatar do cliente */}
      <td className="px-4 py-2">
        <div className="flex items-center justify-center">
          {clientImage ? (
            <img
              src={clientImage}
              alt={appt.clientName ?? "Cliente"}
              className="h-8 w-8 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-background-secondary flex items-center justify-center text-xs font-medium text-content-secondary">
              {clientInitial}
            </div>
          )}
        </div>
      </td>

      <td className="px-4 py-2 font-medium">{appt.clientName}</td>
      <td className="px-4 py-2">{appt.phone}</td>
      <td className="px-4 py-2">{appt.description}</td>
      <td className="px-4 py-2">{dateStr}</td>
      <td className="px-4 py-2">{timeStr}</td>

      <td className="px-4 py-2">
        <AppointmentStatusBadge status={normalizedStatus} />
      </td>

      <td className="px-4 py-2">
        <span className="text-paragraph-small text-content-secondary">
          {actionLog}
        </span>
      </td>

      <td className="px-4 py-3">
        {isPending && (
          <div className="flex justify-end gap-2">
            <AppointmentForm
              appointment={safeApptForForm}
              appointments={appointmentsForForm}
              barbers={barbersForForm}
              services={services}
            />

            <AppointmentActions
              appointmentId={appt.id}
              status={normalizedStatus}
              clientName={appt.clientName}
              phone={appt.phone}
              description={appt.description}
              scheduleAt={appt.scheduleAt}
              barberName={appt.barber?.name}
              servicePrice={
                appt.servicePriceAtTheTime
                  ? Number(appt.servicePriceAtTheTime)
                  : appt.service?.price
                    ? Number(appt.service.price)
                    : undefined
              }
              cancelFeePercentage={
                appt.service?.cancelFeePercentage
                  ? Number(appt.service.cancelFeePercentage)
                  : undefined
              }
              cancelLimitHours={appt.service?.cancelLimitHours ?? undefined}
              cancelledByRole="ADMIN"
              concludedByRole="ADMIN"
              // 🔹 infos de plano (para o modal "Conferir")
              isPlanCredit={isPlanCredit}
              planCreditIndex={planCreditIndex}
              planTotalCredits={planTotalCredits}
            />
          </div>
        )}
      </td>
    </tr>
  );
}
