// src/utils/datetime.ts
export const SAO_PAULO_TIMEZONE = "America/Sao_Paulo";

function toDate(dateInput: string | Date): Date {
  return typeof dateInput === "string" ? new Date(dateInput) : dateInput;
}

/**
 * Retorna hora e minuto em São Paulo para um Date ou string.
 */
export function getSaoPauloTime(dateInput: string | Date): {
  hour: number;
  minute: number;
} {
  const date = toDate(dateInput);

  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);

  const hourPart = parts.find((p) => p.type === "hour");
  const minutePart = parts.find((p) => p.type === "minute");

  const hour = hourPart ? Number(hourPart.value) : 0;
  const minute = minutePart ? Number(minutePart.value) : 0;

  return { hour, minute };
}

/**
 * Só a hora em São Paulo (mantido por compatibilidade).
 */
export function getSaoPauloHour(dateInput: string | Date): number {
  return getSaoPauloTime(dateInput).hour;
}

/**
 * Formata horário no fuso de São Paulo (HH:mm).
 */
export function formatTimeSaoPaulo(dateInput: string | Date): string {
  const date = toDate(dateInput);

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Regra NOVA de horário de funcionamento:
 * Pode agendar CONTÍNUO entre 09:00 e 21:00 (horário de São Paulo).
 */
export function isWithinBusinessHours(dateInput: string | Date): boolean {
  const { hour, minute } = getSaoPauloTime(dateInput);
  const totalMinutes = hour * 60 + minute;

  const start = 9 * 60; // 09:00
  const end = 21 * 60; // 21:00

  return totalMinutes >= start && totalMinutes <= end;
}
