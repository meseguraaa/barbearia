import {
  Appointment,
  AppointmentPeriod,
  AppointmentPeriodDay,
} from "@/types/appointment";
import { formatTimeSaoPaulo, getSaoPauloTime } from "@/utills/datetime";

interface AppointmentPrisma {
  id: string;
  description: string;
  clientName: string;
  phone: string;
  scheduleAt: Date;
}

/* ===== Periodização (manhã / tarde / noite) ===== */
/**
 * Regra para os CARDS:
 * - MANHÃ: agendamentos das 09:00 até 12:30 (inclusive)
 * - TARDE: agendamentos das 13:00 até 18:30 (inclusive)
 * - NOITE: agendamentos das 19:00 até 21:00 (inclusive)
 *
 * Obs.: a regra de PODER AGENDAR é contínua 09:00–21:00 (definida em isWithinBusinessHours).
 */
export const getPeriod = (scheduleAt: Date): AppointmentPeriodDay => {
  const { hour, minute } = getSaoPauloTime(scheduleAt);
  const totalMinutes = hour * 60 + minute;

  const nineAM = 9 * 60;
  const twelveThirty = 12 * 60 + 30;
  const onePM = 13 * 60;
  const sixThirtyPM = 18 * 60 + 30;
  const sevenPM = 19 * 60;
  const ninePM = 21 * 60;

  // Manhã: 09:00 – 12:30
  if (totalMinutes >= nineAM && totalMinutes <= twelveThirty) {
    return "morning";
  }

  // Tarde: 13:00 – 18:30
  if (totalMinutes >= onePM && totalMinutes <= sixThirtyPM) {
    return "afternoon";
  }

  // Noite: 19:00 – 21:00
  if (totalMinutes >= sevenPM && totalMinutes <= ninePM) {
    return "evening";
  }

  // Fora dos horários de funcionamento (09h–21h) cai aqui como "evening" só para não quebrar,
  // mas na prática não deve acontecer porque a validação já barra antes.
  return "evening";
};

export function groupAppointmentByPeriod(
  appointments: AppointmentPrisma[],
): AppointmentPeriod[] {
  const transformedAppointments: Appointment[] = appointments?.map((apt) => {
    return {
      ...apt,
      time: formatTimeSaoPaulo(apt.scheduleAt), // horário correto em SP
      service: apt.description,
      period: getPeriod(apt.scheduleAt), // classifica usando hora+min de São Paulo
    };
  });

  const morningAppointments = transformedAppointments.filter(
    (apt) => apt.period === "morning",
  );
  const afternoonAppointments = transformedAppointments.filter(
    (apt) => apt.period === "afternoon",
  );
  const eveningAppointments = transformedAppointments.filter(
    (apt) => apt.period === "evening",
  );

  return [
    {
      title: "Manhã",
      type: "morning",
      timeRange: "09h - 13h",
      appointments: morningAppointments,
    },
    {
      title: "Tarde",
      type: "afternoon",
      timeRange: "13h - 19h",
      appointments: afternoonAppointments,
    },
    {
      title: "Noite",
      type: "evening",
      timeRange: "19h - 21h",
      appointments: eveningAppointments,
    },
  ];
}
