import type { Barber } from "./barber";

export type Appointment = {
  id: string;
  clientName: string;
  phone: string;
  description: string;
  scheduleAt: Date;

  // relacionamento com barbeiro
  barberId: string;
  barber?: Barber;

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
