import { AdminAppointmentRow } from "@/components/admin-appointment-row";
import type { Appointment as AppointmentType } from "@/types/appointment";
import type { Service } from "@/types/service";

type BarberForForm = {
  id: string;
  name: string;
  email: string;
  phone: string;
  isActive: boolean;
  role: "BARBER";
};

type AppointmentWithBarberPrisma = any;

type BarberGroup = {
  barberId: string | null;
  barberName: string;
  barberImageUrl?: string | null;
  appointments: AppointmentWithBarberPrisma[];
};

type PlanCreditInfo = {
  isPlanCredit: boolean;
  planCreditIndex: number | null;
  planTotalCredits: number | null;
};

type AdminAppointmentsByBarberProps = {
  group: BarberGroup;
  salesCount: number;
  appointmentsForForm: AppointmentType[];
  barbersForForm: BarberForForm[];
  services: Service[];
  planCreditInfoByAppointmentId?: Record<string, PlanCreditInfo>;
};

export function AdminAppointmentsByBarber({
  group,
  salesCount,
  appointmentsForForm,
  barbersForForm,
  services,
  planCreditInfoByAppointmentId,
}: AdminAppointmentsByBarberProps) {
  const avatarInitials = group.barberName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="border border-border-primary rounded-xl overflow-hidden bg-background-tertiary">
      <div className="border-b border-border-primary px-4 py-3 bg-muted/40 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-background-secondary border border-border-primary overflow-hidden flex items-center justify-center text-[11px] font-medium text-content-secondary shrink-0">
            {group.barberImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={group.barberImageUrl}
                alt={group.barberName}
                className="h-full w-full object-cover"
              />
            ) : (
              <span>{avatarInitials}</span>
            )}
          </div>

          <div className="flex flex-col">
            <h2 className="text-label-large text-content-primary">
              {group.barberName}
            </h2>
            <p className="text-paragraph-small text-content-secondary">
              Agendamento(s): {group.appointments.length} • Vendas de produto:{" "}
              {salesCount}
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <tbody>
            {group.appointments.map((appt) => {
              const planInfo = planCreditInfoByAppointmentId?.[appt.id] ?? null;

              return (
                <AdminAppointmentRow
                  key={appt.id}
                  appt={appt}
                  appointmentsForForm={appointmentsForForm}
                  barbersForForm={barbersForForm}
                  services={services}
                  isPlanCredit={planInfo?.isPlanCredit ?? false}
                  planCreditIndex={planInfo?.planCreditIndex ?? null}
                  planTotalCredits={planInfo?.planTotalCredits ?? null}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
