'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import z from 'zod';

/* ---------------------------------------------------------
 * Schema
 * ---------------------------------------------------------*/
const appointmentSchema = z.object({
    tutorName: z.string(),
    petName: z.string(),
    phone: z.string(),
    description: z.string(),
    scheduleAt: z.date(),
});

export type AppointmentData = z.infer<typeof appointmentSchema>;

/* ---------------------------------------------------------
 * Helper: hora em São Paulo (America/Sao_Paulo)
 * ---------------------------------------------------------*/
function getSaoPauloHour(date: Date): number {
    const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: 'numeric',
        hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const hourPart = parts.find((p) => p.type === 'hour');

    // fallback só por segurança
    if (!hourPart) {
        // São Paulo normalmente é UTC-3 (sem horário de verão hoje em dia)
        return (date.getUTCHours() + 21) % 24; // getUTCHours() - 3, mas em módulo 24
    }

    return Number(hourPart.value);
}

/* ---------------------------------------------------------
 * Tabela de janelas de horários (manhã, tarde, noite)
 * ---------------------------------------------------------*/
const SCHEDULE_WINDOWS = [
    { label: 'manhã', start: 9, end: 12 },
    { label: 'tarde', start: 13, end: 18 },
    { label: 'noite', start: 18, end: 21 },
] as const;

/* ---------------------------------------------------------
 * Validação de horário permitido (manhã/tarde/noite)
 * ---------------------------------------------------------*/
function validateScheduleWindow(scheduleAt: Date): string | null {
    // Usa a HORA de São Paulo, não a hora local do servidor
    const hour = getSaoPauloHour(scheduleAt);

    const isValid = SCHEDULE_WINDOWS.some(
        (window) => hour >= window.start && hour < window.end
    );

    if (!isValid) {
        const allowed = SCHEDULE_WINDOWS.map(
            (w) => `${w.start}h-${w.end}h`
        ).join(', ');

        return `Agendamentos só podem ser feitos entre ${allowed} (horário de São Paulo)`;
    }

    return null;
}

/* ---------------------------------------------------------
 * Checar se existe outro agendamento no mesmo horário
 * (usa o instante exato em UTC, o que é correto)
 * ---------------------------------------------------------*/
async function ensureAvailability(
    scheduleAt: Date,
    excludeId?: string
): Promise<string | null> {
    const existing = await prisma.appointment.findFirst({
        where: {
            scheduleAt,
            ...(excludeId && { id: { not: excludeId } }),
        },
    });

    if (existing) {
        return 'Já existe um agendamento para esse horário';
    }

    return null;
}

/* ---------------------------------------------------------
 * Wrapper para operações com try/catch + revalidate
 * ---------------------------------------------------------*/
async function withAppointmentMutation(
    operation: () => Promise<void>,
    defaultError: string
) {
    try {
        await operation();
        revalidatePath('/');
    } catch (err) {
        console.log(err);
        return { error: defaultError };
    }
}

/* ---------------------------------------------------------
 * CREATE
 * ---------------------------------------------------------*/
export async function createAppointment(data: AppointmentData) {
    const parsed = appointmentSchema.parse(data);
    const { scheduleAt } = parsed;

    const scheduleError = validateScheduleWindow(scheduleAt);
    if (scheduleError) return { error: scheduleError };

    const availabilityError = await ensureAvailability(scheduleAt);
    if (availabilityError) return { error: availabilityError };

    return withAppointmentMutation(async () => {
        await prisma.appointment.create({ data: parsed });
    }, 'Falha ao criar o agendamento');
}

/* ---------------------------------------------------------
 * UPDATE
 * ---------------------------------------------------------*/
export async function updateAppointment(id: string, data: AppointmentData) {
    const parsed = appointmentSchema.parse(data);
    const { scheduleAt } = parsed;

    const scheduleError = validateScheduleWindow(scheduleAt);
    if (scheduleError) return { error: scheduleError };

    const availabilityError = await ensureAvailability(scheduleAt, id);
    if (availabilityError) return { error: availabilityError };

    return withAppointmentMutation(async () => {
        await prisma.appointment.update({
            where: { id },
            data: parsed,
        });
    }, 'Falha ao atualizar o agendamento');
}

/* ---------------------------------------------------------
 * DELETE
 * ---------------------------------------------------------*/
export async function deleteAppointment(id: string) {
    return withAppointmentMutation(async () => {
        await prisma.appointment.delete({ where: { id } });
    }, 'Falha ao excluir o agendamento');
}
