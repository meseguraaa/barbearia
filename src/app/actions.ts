import { getHours, getMinutes, isSameDay } from "date-fns";
import { Appointment } from "@/types/appointment";

export const SERVICE_OPTIONS = [
  "Barba",
  "Barba & Cabelo",
  "Cabelo na tesoura",
  "Cabelo na máquina",
];

export const getServiceDuration = (description?: string): number => {
  if (!description) return 30;

  const normalized = description.trim().toLowerCase();

  if (normalized.startsWith("barba & cabelo")) return 60;
  if (normalized.startsWith("cabelo na tesoura")) return 60;
  if (normalized.startsWith("barba - r$80")) return 30;
  if (normalized.startsWith("cabelo na máquina")) return 30;

  return 30;
};

const generateTimeOptions = () => {
  const times: string[] = [];
  for (let hour = 9; hour <= 21; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      if (hour === 21 && minute > 0) break;
      times.push(
        `${hour.toString().padStart(2, "0")}:${minute
          .toString()
          .padStart(2, "0")}`,
      );
    }
  }
  return times;
};

export const TIME_OPTIONS = generateTimeOptions();

export const getAvailableTimes = (params: {
  date?: Date | null;
  service?: string;
  appointments: Appointment[];
  currentAppointmentId?: string;
}): string[] => {
  const { date, service, appointments, currentAppointmentId } = params;

  if (!date || !service) return [];

  const now = new Date();
  const duration = getServiceDuration(service);

  let baseTimes = [...TIME_OPTIONS];

  if (isSameDay(date, now)) {
    const nowMinutes = getHours(now) * 60 + getMinutes(now);

    baseTimes = baseTimes.filter((time) => {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m > nowMinutes;
    });
  }

  // 👇 FILTRA CANCELADOS (NOVO!)
  const dayAppointments = appointments.filter(
    (appt) =>
      isSameDay(new Date(appt.scheduleAt), date) && appt.status !== "CANCELED",
  );

  const available = baseTimes.filter((time) => {
    const [h, m] = time.split(":").map(Number);

    const start = h * 60 + m;
    const end = start + duration;

    for (const appt of dayAppointments) {
      if (currentAppointmentId && appt.id === currentAppointmentId) continue;

      const apptDate = new Date(appt.scheduleAt);
      const apptStart = getHours(apptDate) * 60 + getMinutes(apptDate);
      const apptDuration = getServiceDuration(appt.description);
      const apptEnd = apptStart + apptDuration;

      const overlap = start < apptEnd && apptStart < end;
      if (overlap) return false;
    }

    return true;
  });

  return available;
};
