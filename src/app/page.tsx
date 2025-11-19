import { AppointmentForm } from '@/components/appointment-form';
import { DatePicker } from '@/components/date-picker';
import { PeriodSection } from '@/components/period-section/period-section';
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/prisma';
import { groupAppointmentByPeriod } from '@/utills/appoitment-utills';
import { endOfDay, startOfDay } from 'date-fns';

// força essa página a ser dinâmica (sem cache estático)
export const dynamic = 'force-dynamic';

type HomeProps = {
    searchParams: Promise<{
        date?: string;
    }>;
};

export default async function Home({ searchParams }: HomeProps) {
    // 👉 searchParams agora é uma Promise, então precisamos dar await
    const resolvedSearchParams = await searchParams;
    const dateParam = resolvedSearchParams.date;

    // Data base vinda da URL (?date=yyyy-MM-dd) ou hoje
    const baseDate = (() => {
        if (!dateParam) return new Date();

        const [year, month, day] = dateParam.split('-').map(Number);
        return new Date(year, month - 1, day);
    })();

    const dayStart = startOfDay(baseDate);
    const dayEnd = endOfDay(baseDate);

    const appointments = await prisma.appointment.findMany({
        where: {
            scheduleAt: {
                gte: dayStart,
                lte: dayEnd,
            },
        },
        orderBy: {
            scheduleAt: 'asc',
        },
    });

    const periods = groupAppointmentByPeriod(appointments);

    return (
        <div className="bg-background-primary p-6">
            <div className="flex items-center justify-between mb-8 gap-4">
                <div>
                    <h1 className="text-title-size text-content-primary mb-2">
                        Sua Agenda
                    </h1>
                    <p className="text-paragraph-medium-size text-content-secondary">
                        Aqui você pode ver todos os clientes e serviços
                        agendados para hoje.
                    </p>
                </div>
                <div className="hidden md:flex items-center gap-4">
                    <DatePicker />
                </div>
            </div>

            <div className="mt-3 mb-8 md:hidden">
                <DatePicker />
            </div>

            <div className="pb-24 md:pb-0">
                {periods.map((period, index) => (
                    <PeriodSection period={period} key={index} />
                ))}
            </div>

            <div className="fixed bottom-0 left-0 right-0 flex justify-center bg-[#23242d] py-[18px] px-6 md:bottom-6 md:right-6 md:left-auto md:top-auto md:w-auto md:bg-transparent md:p-0">
                <AppointmentForm>
                    <Button variant="brand">Agendar Consulta</Button>
                </AppointmentForm>
            </div>
        </div>
    );
}
