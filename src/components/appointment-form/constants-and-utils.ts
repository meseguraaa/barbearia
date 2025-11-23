import { getHours, getMinutes, isSameDay } from "date-fns";
import { Appointment } from "@/types/appointment";

/**
 * ⚠️ IMPORTANTE:
 * SERVICE_OPTIONS agora serve apenas como fallback visual.
 * O tipo NÃO depende mais dessas opções fixas.
 */
export const SERVICE_OPTIONS = [
  "Barba",
  "Barba & Cabelo",
  "Cabelo na tesoura",
  "Cabelo na máquina",
];

/**
 * 🔥 Agora qualquer string pode ser um serviço dinâmico
 * vindo do banco de dados.
 */
export type ServiceOption = string;

/**
 * Mapa de duração padrão para alguns serviços conhecidos.
 * (Mantemos isso como fallback.)
 */
const SERVICE_DURATION_MAP: Record<string, number> = {
  Barba: 30,
  "Barba & Cabelo": 60,
  "Cabelo na tesoura": 60,
  "Cabelo na máquina": 30,
};

/**
 * Retorna a duração correta do serviço.
 * - Caso seja um serviço novo do banco, retorna 30 como fallback.
 * - Caso seja um nome conhecido, retorna a duração correta.
 */
export const getServiceDuration = (description?: string): number => {
  if (!description) return 30;

  const normalized = description.trim().toLowerCase();

  if (normalized.startsWith("barba & cabelo")) return 60;
  if (normalized.startsWith("cabelo na tesoura")) return 60;
  if (normalized.startsWith("barba - r$80")) return 30;
  if (normalized.startsWith("cabelo na máquina")) return 30;

  // Se estiver no mapa fixo
  if (description in SERVICE_DURATION_MAP) {
    return SERVICE_DURATION_MAP[description];
  }

  // Fallback para serviços novos vindos do admin
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
 * Calcula horários disponíveis considerando:
 * - Data selecionada
 * - Serviço selecionado (duração)
 * - Agendamentos existentes (sem sobreposição)
 * - Horários passados no dia atual
 */
export const getAvailableTimes = (params: {
  date?: Date | null;
  service?: string;
  appointments: Appointment[];
  currentAppointmentId?: string;
}): string[] => {
  const { date, service, appointments, currentAppointmentId } = params;

  if (!date || !service) return [];

  const now = new Date();

  const selectedDuration = getServiceDuration(service);

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

  // Filtra agendamentos do dia
  const dayAppointments = appointments.filter((appt) =>
    isSameDay(new Date(appt.scheduleAt), date),
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
