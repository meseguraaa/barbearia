import { getHours, getMinutes, isSameDay } from "date-fns";
import { Appointment } from "@/types/appointment";

/**
 * SERVICE_OPTIONS agora é só visual / fallback.
 */
export const SERVICE_OPTIONS = [
  "Barba",
  "Barba & Cabelo",
  "Cabelo na tesoura",
  "Cabelo na máquina",
];

/**
 * Duração padrão dos serviços conhecidos.
 */
const SERVICE_DURATION_MAP: Record<string, number> = {
  Barba: 30,
  "Barba & Cabelo": 60,
  "Cabelo na tesoura": 60,
  "Cabelo na máquina": 30,
};

export const getServiceDuration = (description?: string): number => {
  if (!description) return 30;

  const normalized = description.trim().toLowerCase();

  if (normalized.startsWith("barba & cabelo")) return 60;
  if (normalized.startsWith("cabelo na tesoura")) return 60;
  if (normalized.startsWith("barba - r$80")) return 30;
  if (normalized.startsWith("cabelo na máquina")) return 30;

  if (description in SERVICE_DURATION_MAP) {
    return SERVICE_DURATION_MAP[description];
  }

  return 30;
};

/**
 * Gera todos os horários de 30 em 30 minutos entre 09:00 e 21:00
 */
const generateTimeOptions = (): string[] => {
  const times: string[] = [];

  for (let hour = 9; hour <= 21; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      if (hour === 21 && minute > 0) break;
      const timeString = `${hour.toString().padStart(2, "0")}:${minute
        .toString()
        .padStart(2, "0")}`;
      times.push(timeString);
    }
  }

  return times;
};

export const TIME_OPTIONS = generateTimeOptions();

/**
 * Janela de disponibilidade (HH:mm)
 */
export type AvailabilityWindow = {
  startTime: string; // "09:00"
  endTime: string; // "18:00"
};

/**
 * Calcula horários disponíveis
 */
export const getAvailableTimes = (params: {
  date?: Date | null;
  service?: string;
  appointments: Appointment[];
  currentAppointmentId?: string;
  /**
   * Janelas de disponibilidade para esse dia.
   *
   * - undefined  -> usa o comportamento padrão (09:00–21:00)
   * - []         -> dia sem disponibilidade (retorna [])
   * - [{...},..] -> restringe os horários para caber dentro de pelo menos uma janela
   */
  availabilityWindows?: AvailabilityWindow[];
}): string[] => {
  const {
    date,
    service,
    appointments,
    currentAppointmentId,
    availabilityWindows,
  } = params;

  if (!date || !service) return [];

  const now = new Date();
  const selectedDuration = getServiceDuration(service);

  // Se foi passado availabilityWindows, mas veio array vazio, significa:
  // "esse dia não tem disponibilidade"
  if (availabilityWindows && availabilityWindows.length === 0) {
    return [];
  }

  let baseTimes = [...TIME_OPTIONS];

  // Se for hoje → remove horários passados
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

  // Se existirem janelas de disponibilidade, restringe os horários para caber nelas
  if (availabilityWindows && availabilityWindows.length > 0) {
    baseTimes = baseTimes.filter((time) => {
      const [hourStr, minuteStr] = time.split(":");
      const hour = Number(hourStr);
      const minute = Number(minuteStr);
      const candidateStart = hour * 60 + minute;
      const candidateEnd = candidateStart + selectedDuration;

      // horário é válido se couber totalmente em pelo menos uma janela
      return availabilityWindows.some((window) => {
        const [startHourStr, startMinuteStr] = window.startTime.split(":");
        const [endHourStr, endMinuteStr] = window.endTime.split(":");

        const windowStart = Number(startHourStr) * 60 + Number(startMinuteStr);
        const windowEnd = Number(endHourStr) * 60 + Number(endMinuteStr);

        return candidateStart >= windowStart && candidateEnd <= windowEnd;
      });
    });
  }

  // Filtra agendamentos do dia e IGNORA CANCELADOS
  const dayAppointments = appointments.filter(
    (appt) =>
      isSameDay(new Date(appt.scheduleAt), date) && appt.status !== "CANCELED",
  );

  // Remove horários que colidem com agendamentos
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
