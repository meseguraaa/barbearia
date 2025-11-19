import { AppointmentPeriod, Appointment } from '@/types/appointment';
import { Cloudy, Moon, Sun } from 'lucide-react';
import { AppointmentCard } from '../appoitment-card';

type PeriodSectionProps = {
    period: AppointmentPeriod;
};

const periodIcons = {
    morning: <Sun className="text-accent-blue" />,
    afternoon: <Cloudy className="text-accent-orange" />,
    evening: <Moon className="text-accent-yellow" />,
};

export const PeriodSection = ({ period }: PeriodSectionProps) => {
    return (
        <section className="mb-8 bg-background-tertiary rounded-xl">
            <div className="flex items-center px-5 py-3 justify-between border-b border-[#2E2C30]">
                <div className="flex items-center gap-2">
                    {periodIcons[period?.type]}
                    <h2 className="text-label-large-size text-content-primary">
                        {period?.title}
                    </h2>
                </div>
                <span className="text-label-large-size text-content-secondary">
                    {period.timeRange}
                </span>
            </div>
            {period.appointments.length > 0 ? (
                <div className="px-5">
                    <div>
                        {period.appointments.map(
                            (appointment: Appointment, index: number) => (
                                <AppointmentCard
                                    key={index}
                                    appointment={appointment}
                                    isFirstInSection={index === 0}
                                />
                            )
                        )}
                    </div>
                </div>
            ) : (
                <p className="px-5 py-4 text-paragraph-small-size text-gray-500">
                    Nenhum agendamento encontrado.
                </p>
            )}
        </section>
    );
};
