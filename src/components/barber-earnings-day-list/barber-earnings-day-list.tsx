// components/barber-earnings-day-list/barber-earnings-day-list.tsx

type BarberEarningsDayAppointment = {
  id: string;
  clientName: string;
  description: string;
  time: string;
  priceFormatted: string;
  percentageFormatted: string;
  earningFormatted: string;
};

type BarberEarningsDayListProps = {
  appointments: BarberEarningsDayAppointment[];
};

export function BarberEarningsDayList({
  appointments,
}: BarberEarningsDayListProps) {
  if (appointments.length === 0) {
    return (
      <p className="text-paragraph-small text-content-secondary">
        Você não possui atendimentos concluídos para esta data.
      </p>
    );
  }

  return (
    <section className="space-y-3">
      {appointments.map((appt) => (
        <div
          key={appt.id}
          className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3"
        >
          <div className="grid w-full grid-cols-1 gap-2 md:grid-cols-6 md:items-center">
            {/* Cliente */}
            <div>
              <span className="text-paragraph-medium text-content-primary font-medium">
                {appt.clientName}
              </span>
            </div>

            {/* Serviço */}
            <div className="text-paragraph-medium text-content-primary md:text-center">
              {appt.description}
            </div>

            {/* Horário */}
            <div className="text-paragraph-medium text-content-primary md:text-center">
              {appt.time}
            </div>

            {/* Valor do serviço */}
            <div className="text-paragraph-medium text-content-primary md:text-center">
              {appt.priceFormatted}
            </div>

            {/* % do barbeiro */}
            <div className="text-paragraph-medium text-content-primary md:text-center">
              {appt.percentageFormatted}
            </div>

            {/* Ganho do barbeiro */}
            <div className="text-paragraph-medium text-content-primary md:text-right">
              {appt.earningFormatted}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
