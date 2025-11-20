import { getHours, getMinutes, isSameDay } from "date-fns";
import { Appointment } from "@/types/appointment";

export const SERVICE_OPTIONS = [
  "Barba - R$80,00",
  "Barba & Cabelo - R$120,00",
  "Cabelo na tesoura - R$100,00",
  "Cabelo na máquina - R$90,00",
] as const;

export type ServiceOption = (typeof SERVICE_OPTIONS)[number];

// ⏱ Duração de cada serviço (em minutos)
const SERVICE_DURATION_MAP: Record<ServiceOption, number> = {
  "Barba - R$80,00": 30,
  "Barba & Cabelo - R$120,00": 60,
  "Cabelo na tesoura - R$100,00": 60,
  "Cabelo na máquina - R$90,00": 30,
};

/**
 * Função robusta para descobrir a duração do serviço
 * a partir da descrição salva no banco.
 */
export const getServiceDuration = (description?: string): number => {
  if (!description) return 30;

  const normalized = description.trim().toLowerCase();

  if (normalized.startsWith("barba & cabelo")) return 60;
  if (normalized.startsWith("cabelo na tesoura")) return 60;
  if (normalized.startsWith("barba - r$80")) return 30;
  if (normalized.startsWith("cabelo na máquina")) return 30;

  const key = description as ServiceOption;
  if (key in SERVICE_DURATION_MAP) {
    return SERVICE_DURATION_MAP[key];
  }

  return 30;
};

const generateTimeOptions = (): string[] => {
  const times: string[] = [];

  for (let hour = 9; hour <= 21; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      if (hour === 21 && minute > 0) break;
      const timeString = `${hour
        .toString()
        .padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
      times.push(timeString);
    }
  }

  return times;
};

export const TIME_OPTIONS = generateTimeOptions();

// 🔍 Calcula horários disponíveis considerando:
// - data selecionada
// - serviço selecionado (duração)
// - agendamentos existentes (sem sobrepor)
// - horários passados no dia de hoje
export const getAvailableTimes = (params: {
  date?: Date | null;
  service?: ServiceOption | undefined;
  appointments: Appointment[];
  currentAppointmentId?: string;
}): string[] => {
  const { date, service, appointments, currentAppointmentId } = params;

  if (!date || !service) return [];

  const now = new Date();

  const selectedDuration = getServiceDuration(service);

  let baseTimes = [...TIME_OPTIONS];

  // Se for hoje, remove horários que já passaram
  if (isSameDay(date, now)) {
    const currentMinutes = getHours(now) * 60 + getMinutes(now);

    baseTimes = baseTimes.filter((time) => {
      const [hourStr, minuteStr] = time.split(":");
      const hour = Number(hourStr);
      const minute = Number(minuteStr);
      const timeMinutes = hour * 60 + minute;

      return timeMinutes > currentMinutes;
    });
  }

  // Filtra agendamentos só desse dia (independente do barbeiro)
  const dayAppointments = appointments.filter((appt) =>
    isSameDay(new Date(appt.scheduleAt), date),
  );

  // Remove horários que colidem com qualquer agendamento existente
  const availableTimes = baseTimes.filter((time) => {
    const [hourStr, minuteStr] = time.split(":");
    const hour = Number(hourStr);
    const minute = Number(minuteStr);
    const candidateStart = hour * 60 + minute;
    const candidateEnd = candidateStart + selectedDuration;

    for (const appt of dayAppointments) {
      if (currentAppointmentId && appt.id === currentAppointmentId) continue;

      const apptDate = new Date(appt.scheduleAt);
      const apptStart = getHours(apptDate) * 60 + getMinutes(apptDate);
      const apptDuration = getServiceDuration(appt.description);
      const apptEnd = apptStart + apptDuration;

      const overlap = candidateStart < apptEnd && apptStart < candidateEnd;

      if (overlap) return false;
    }

    return true;
  });

  return availableTimes;
};
