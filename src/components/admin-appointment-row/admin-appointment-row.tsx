// src/components/admin-appointment-row.tsx
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { AppointmentForm } from "@/components/appointment-form";
import { AppointmentActions } from "@/components/appointment-actions";
import type { Appointment as AppointmentType } from "@/types/appointment";
import type { Service } from "@/types/service";
import type { UnitOption } from "@/components/appointment-form";

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

  // ✅ unidades para o AppointmentForm (pra mostrar unidade no editar)
  units?: UnitOption[];

  // 🔹 infos de plano por agendamento (opcionais)
  isPlanCredit?: boolean;
  planCreditIndex?: number | null;
  planTotalCredits?: number | null;
};

function pickDisplayName(entity: any): string | null {
  if (!entity) return null;

  const n = String(entity.name ?? "").trim();
  if (n) return n;

  const email = String(entity.email ?? "").trim();
  if (email) return email;

  return null;
}

/**
 * Formata "quem" + "rótulo do papel" com base no role e nas relations.
 * - ADMIN: usa User (concludedByUser/cancelledByUser)
 * - BARBER: usa Barber (concludedByBarber/cancelledByBarber)
 */
function formatActorLabel(args: {
  role: "ADMIN" | "BARBER" | null;
  user?: any | null; // User
  barber?: any | null; // Barber
}): { who: string | null; roleLabel: string | null } {
  const { role, user, barber } = args;

  if (role === "ADMIN") {
    const who = pickDisplayName(user);
    return { who, roleLabel: "ADMIN" };
  }

  if (role === "BARBER") {
    const who = pickDisplayName(barber);
    return { who, roleLabel: "Barbeiro" };
  }

  return { who: null, roleLabel: null };
}

export function AdminAppointmentRow({
  appt,
  appointmentsForForm,
  barbersForForm,
  services,
  units = [],
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

  const safeApptForForm: AppointmentType = {
    ...(apptForForm ?? {
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
            name: appt.barber.name ?? "",
            email: appt.barber.email ?? "",
            phone: appt.barber.phone,
            isActive: appt.barber.isActive,
            role: "BARBER",
          }
        : undefined,
      serviceId: appt.serviceId ?? undefined,
    }),

    // ✅ força unitId a existir no objeto final do form
    unitId: (apptForForm as any)?.unitId ?? appt.unitId ?? undefined,
  } as any;

  // avatar do cliente
  const clientImage = appt.client?.image ?? null;
  const clientInitial = appt.clientName?.[0]?.toUpperCase() ?? "?";

  // ✅ Action log com NOME do ator (quando existir)
  // Requer includes no Prisma:
  // - concludedByUser / concludedByBarber / cancelledByUser / cancelledByBarber
  let actionLog = "—";

  if (appt.status === "DONE") {
    const role = (appt.concludedByRole as "ADMIN" | "BARBER" | null) ?? null;

    const { who, roleLabel } = formatActorLabel({
      role,
      user: appt.concludedByUser ?? null,
      barber: appt.concludedByBarber ?? null,
    });

    if (who && roleLabel) {
      actionLog = `Concluído por ${who} (${roleLabel})`;
    } else if (roleLabel) {
      actionLog = `Concluído pelo ${roleLabel}`;
    } else {
      actionLog = "Concluído";
    }
  } else if (appt.status === "CANCELED") {
    const hasFee = !!appt.cancelFeeApplied;
    const role = (appt.cancelledByRole as "ADMIN" | "BARBER" | null) ?? null;

    const { who, roleLabel } = formatActorLabel({
      role,
      user: appt.cancelledByUser ?? null,
      barber: appt.cancelledByBarber ?? null,
    });

    const feeSuffix = hasFee ? " - com taxa" : " - sem taxa";

    if (who && roleLabel) {
      actionLog = `Cancelado por ${who} (${roleLabel})${feeSuffix}`;
    } else if (roleLabel) {
      actionLog = `Cancelado pelo ${roleLabel}${feeSuffix}`;
    } else {
      actionLog = `Cancelado${feeSuffix}`;
    }
  }

  return (
    <tr className="border-b border-border-primary hover:bg-muted/30">
      {/* avatar do cliente */}
      <td className="px-4 py-2">
        <div className="flex items-center justify-center">
          {clientImage ? (
            // eslint-disable-next-line @next/next/no-img-element
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
              mode="admin"
              appointment={safeApptForForm}
              appointments={appointmentsForForm}
              barbers={barbersForForm}
              services={services}
              units={units}
              // 🚫 NÃO passar mode="admin" aqui (isso esconde campos no editar)
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
