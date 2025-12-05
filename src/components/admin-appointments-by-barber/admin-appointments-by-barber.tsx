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
  appointments: AppointmentWithBarberPrisma[];
};

type AdminAppointmentsByBarberProps = {
  group: BarberGroup;
  salesCount: number;
  appointmentsForForm: AppointmentType[];
  barbersForForm: BarberForForm[];
  services: Service[];
};

export function AdminAppointmentsByBarber({
  group,
  salesCount,
  appointmentsForForm,
  barbersForForm,
  services,
}: AdminAppointmentsByBarberProps) {
  return (
    <div className="border border-border-primary rounded-xl overflow-hidden bg-background-tertiary">
      {/* Cabeçalho do barbeiro */}
      <div className="border-b border-border-primary px-4 py-3 bg-muted/40 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-label-large text-content-primary">
            {group.barberName}
          </h2>
          <p className="text-paragraph-small text-content-secondary">
            Agendamento(s): {group.appointments.length} • Vendas de produto:{" "}
            {salesCount}
          </p>
        </div>
      </div>

      {/* Tabela de agendamentos */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <tbody>
            {group.appointments.map((appt) => (
              <AdminAppointmentRow
                key={appt.id}
                appt={appt}
                appointmentsForForm={appointmentsForForm}
                barbersForForm={barbersForForm}
                services={services}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
