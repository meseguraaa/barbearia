import type { Barber } from "./barber";

export type AppointmentStatus = "PENDING" | "DONE" | "CANCELED";

export type Appointment = {
  id: string;
  clientName: string;
  phone: string;

  /**
   * Normalmente é o nome do serviço,
   * mas pode ser usado como descrição livre também.
   */
  description: string;

  scheduleAt: Date;

  status?: AppointmentStatus;

  // relacionamento com barbeiro
  barberId: string;
  barber?: Barber | null;

  /**
   * Serviço associado ao agendamento (opcional porque
   * nem todos os lugares estão preenchendo ainda).
   */
  serviceId?: string;

  // campos calculados no front
  time?: string;
  period?: "morning" | "afternoon" | "evening";
};

export type AppointmentPeriod = {
  type: "morning" | "afternoon" | "evening";
  title: string;
  timeRange: string;
  appointments: Appointment[];
};
