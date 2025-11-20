// src/utills/appoitment-utills.ts
import { Appointment, AppointmentPeriod } from "@/types/appointment";

export const groupAppointmentByPeriod = (appointments: Appointment[]) => {
  const morning = appointments.filter(
    (apt) => new Date(apt.scheduleAt).getHours() < 12,
  );

  const afternoon = appointments.filter((apt) => {
    const h = new Date(apt.scheduleAt).getHours();
    return h >= 12 && h < 18;
  });

  const evening = appointments.filter(
    (apt) => new Date(apt.scheduleAt).getHours() >= 18,
  );

  const periods: AppointmentPeriod[] = [
    {
      type: "morning",
      title: "Manhã",
      timeRange: "09:00 - 12:00",
      appointments: morning,
    },
    {
      type: "afternoon",
      title: "Tarde",
      timeRange: "12:00 - 18:00",
      appointments: afternoon,
    },
    {
      type: "evening",
      title: "Noite",
      timeRange: "18:00 - 21:00",
      appointments: evening,
    },
  ];

  return periods;
};
