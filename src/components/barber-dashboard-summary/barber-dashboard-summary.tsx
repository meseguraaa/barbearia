// components/barber-dashboard-summary/barber-dashboard-summary.tsx

type BarberDashboardSummaryProps = {
  totalDoneDay: number;
  totalDoneMonth: number;
  totalCanceledDay: number;
  totalCanceledMonth: number;
  totalCanceledWithFeeDay: number;
  totalCanceledWithFeeMonth: number;
};

export function BarberDashboardSummary({
  totalDoneDay,
  totalDoneMonth,
  totalCanceledDay,
  totalCanceledMonth,
  totalCanceledWithFeeDay,
  totalCanceledWithFeeMonth,
}: BarberDashboardSummaryProps) {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-2">
        <p className="text-label-small text-content-secondary">
          Atendimentos concluídos
        </p>
        <p className="text-paragraph-medium text-content-primary">
          Dia: <span className="font-semibold">{totalDoneDay}</span>
        </p>
        <p className="text-paragraph-medium text-content-primary">
          Mês: <span className="font-semibold">{totalDoneMonth}</span>
        </p>
      </div>

      <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-2">
        <p className="text-label-small text-content-secondary">Cancelamentos</p>
        <p className="text-paragraph-medium text-content-primary">
          Dia: <span className="font-semibold">{totalCanceledDay}</span>
        </p>
        <p className="text-paragraph-medium text-content-primary">
          Mês: <span className="font-semibold">{totalCanceledMonth}</span>
        </p>
      </div>

      <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-2">
        <p className="text-label-small text-content-secondary">
          Cancelamentos com taxa
        </p>
        <p className="text-paragraph-medium text-content-primary">
          Dia: <span className="font-semibold">{totalCanceledWithFeeDay}</span>
        </p>
        <p className="text-paragraph-medium text-content-primary">
          Mês:{" "}
          <span className="font-semibold">{totalCanceledWithFeeMonth}</span>
        </p>
      </div>
    </section>
  );
}
