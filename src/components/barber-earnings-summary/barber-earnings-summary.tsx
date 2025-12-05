// components/barber-earnings-summary/barber-earnings-summary.tsx

type BarberEarningsSummaryProps = {
  // ganhos do dia
  totalEarningsDay: string;
  serviceEarningsDay: string;
  productEarningsDay: string;

  // taxas de cancelamento
  cancelFeeDay: string;
  cancelFeeMonth: string;

  // atendimentos
  totalAppointmentsDay: number;
  totalAppointmentsMonth: number;
  totalAppointmentsCanceledDay: number;
  totalAppointmentsCanceledMonth: number;

  // faturamento do mês
  totalEarningsMonth: string;
  serviceEarningsMonth: string;
  productEarningsMonth: string;

  // produtos
  totalProductsSoldDay: number;
  totalProductsSoldMonth: number;
  productEarningsDayLabel: string;
  productEarningsMonthLabel: string;
};

export function BarberEarningsSummary({
  totalEarningsDay,
  serviceEarningsDay,
  productEarningsDay,

  cancelFeeDay,
  cancelFeeMonth,

  totalAppointmentsDay,
  totalAppointmentsMonth,
  totalAppointmentsCanceledDay,
  totalAppointmentsCanceledMonth,

  totalEarningsMonth,
  serviceEarningsMonth,
  productEarningsMonth,

  totalProductsSoldDay,
  totalProductsSoldMonth,
  productEarningsDayLabel,
  productEarningsMonthLabel,
}: BarberEarningsSummaryProps) {
  return (
    <section className="grid gap-4 md:grid-cols-4">
      {/* Ganhos no dia (serviços + produtos) */}
      <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-1">
        <p className="text-label-small text-content-secondary">Ganhos no dia</p>
        <p className="text-title text-content-primary">{totalEarningsDay}</p>
        <p className="text-paragraph-small text-content-secondary">
          Serviços: {serviceEarningsDay} • Produtos: {productEarningsDay}
        </p>
      </div>

      {/* Taxas de cancelamento */}
      <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-1">
        <p className="text-label-small text-content-secondary">
          Taxas de cancelamento
        </p>
        <p className="text-paragraph-medium text-content-primary">
          Dia: <span className="font-semibold">{cancelFeeDay}</span>
        </p>
        <p className="text-paragraph-medium text-content-primary">
          Mês: <span className="font-semibold">{cancelFeeMonth}</span>
        </p>
      </div>

      {/* Atendimentos concluídos e cancelados */}
      <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-3">
        <p className="text-label-small text-content-secondary">Atendimentos</p>

        <div className="grid grid-cols-2 gap-4">
          {/* Concluídos */}
          <div className="space-y-1">
            <p className="text-paragraph-small text-content-secondary">
              Concluídos
            </p>
            <p className="text-paragraph-medium text-content-primary">
              Dia: <span className="font-semibold">{totalAppointmentsDay}</span>
            </p>
            <p className="text-paragraph-medium text-content-primary">
              Mês:{" "}
              <span className="font-semibold">{totalAppointmentsMonth}</span>
            </p>
          </div>

          {/* Cancelados */}
          <div className="space-y-1">
            <p className="text-paragraph-small text-content-secondary">
              Cancelados
            </p>
            <p className="text-paragraph-medium text-content-primary">
              Dia:{" "}
              <span className="font-semibold">
                {totalAppointmentsCanceledDay}
              </span>
            </p>
            <p className="text-paragraph-medium text-content-primary">
              Mês:{" "}
              <span className="font-semibold">
                {totalAppointmentsCanceledMonth}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Faturamento do mês (serviços + produtos + taxas) */}
      <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-1">
        <p className="text-label-small text-content-secondary">
          Faturamento do mês
        </p>
        <p className="text-title text-content-primary">{totalEarningsMonth}</p>
        <p className="text-paragraph-small text-content-secondary">
          Serviços: {serviceEarningsMonth} • Produtos: {productEarningsMonth}
        </p>
      </div>

      {/* Vendas de produtos (do barbeiro) */}
      <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-3 md:col-span-2">
        <p className="text-label-small text-content-secondary">
          Vendas de produtos
        </p>

        <div className="space-y-3">
          {/* Hoje */}
          <div className="space-y-1">
            <p className="text-label-small text-content-secondary">
              Ganho hoje com produtos
            </p>
            <p className="text-title text-content-primary">
              {totalProductsSoldDay} - {productEarningsDayLabel}
            </p>
          </div>

          {/* Mês */}
          <div className="space-y-1">
            <p className="text-label-small text-content-secondary">
              Ganho no mês com produtos
            </p>
            <p className="text-title text-content-primary">
              {totalProductsSoldMonth} - {productEarningsMonthLabel}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
