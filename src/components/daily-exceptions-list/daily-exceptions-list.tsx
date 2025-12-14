// app/barber/availability/daily-exceptions-list.tsx
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DailyExceptionDeleteButton } from "@/components/daily-exception-delete-button";

type DailyExceptionsListProps = {
  barberId: string;
};

async function getActiveUnitIdForBarberOrThrow(barberId: string) {
  const activeBarberUnit = await prisma.barberUnit.findFirst({
    where: {
      barberId,
      isActive: true,
    },
    select: { unitId: true },
    orderBy: { createdAt: "asc" },
  });

  if (!activeBarberUnit?.unitId) {
    throw new Error("Este profissional não possui unidade ativa vinculada.");
  }

  return activeBarberUnit.unitId;
}

export async function DailyExceptionsList({
  barberId,
}: DailyExceptionsListProps) {
  const unitId = await getActiveUnitIdForBarberOrThrow(barberId);

  const exceptions = await prisma.barberDailyAvailability.findMany({
    where: {
      barberId,
      unitId, // ✅ CRÍTICO: evita listar exceção de outra unidade
    },
    include: {
      intervals: true,
    },
    orderBy: {
      date: "asc",
    },
  });

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-paragraph-large-size text-content-primary font-semibold">
          Exceções por dia
        </h2>
        <p className="text-paragraph-small-size text-content-secondary">
          Veja e gerencie dias com horários diferentes do padrão semanal.
        </p>
      </div>

      {exceptions.length === 0 ? (
        <div className="mt-2 rounded-lg border border-dashed border-border-secondary px-4 py-6 text-center text-paragraph-small-size text-content-secondary">
          Você ainda não possui nenhuma exceção cadastrada. Use o botão{" "}
          <strong>Criar exceção</strong> para bloquear um dia ou alguns horários
          específicos.
        </div>
      ) : (
        <div className="space-y-2">
          {exceptions.map((ex) => {
            const dateLabel = format(ex.date, "EEEE, dd 'de' MMMM", {
              locale: ptBR,
            });

            const isDayOff = ex.type === "DAY_OFF";

            return (
              <div
                key={ex.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-border-primary bg-background-tertiary px-4 py-3"
              >
                <div className="space-y-1">
                  <p className="text-paragraph-medium-size text-content-primary font-medium">
                    {dateLabel}
                  </p>

                  {isDayOff ? (
                    <p className="text-paragraph-small-size text-content-secondary">
                      <span className="font-semibold text-content-destructive">
                        Dia inteiro indisponível
                      </span>{" "}
                      – nenhum horário ficará disponível para agendamento.
                    </p>
                  ) : ex.intervals.length === 0 ? (
                    <p className="text-paragraph-small-size text-content-secondary">
                      Exceção sem intervalos cadastrados.
                    </p>
                  ) : (
                    <div className="space-y-1 text-paragraph-small-size text-content-secondary">
                      <p className="font-medium text-content-primary">
                        Horários disponíveis neste dia:
                      </p>
                      <ul className="flex flex-wrap gap-2 text-[12px]">
                        {ex.intervals.map((interval) => (
                          <li
                            key={interval.id}
                            className="rounded-full bg-background-secondary px-2 py-0.5"
                          >
                            {interval.startTime} - {interval.endTime}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <DailyExceptionDeleteButton
                  barberId={barberId}
                  dateISO={ex.date.toISOString()}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
