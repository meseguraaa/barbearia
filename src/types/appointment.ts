import type { Barber } from "./barber";

export type AppointmentStatus = "PENDING" | "DONE" | "CANCELED";

export type Appointment = {
  id: string;
  clientName: string;
  phone: string;
  description: string;
  scheduleAt: Date;

  status?: AppointmentStatus; // <- novo campo (opcional por segurança)

  // relacionamento com barbeiro
  barberId: string;
  barber?: Barber | null; // <- aqui só deixei mais flexível

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
