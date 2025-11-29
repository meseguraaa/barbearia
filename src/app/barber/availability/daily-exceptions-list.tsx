import { prisma } from "@/lib/prisma";
import { format, startOfToday } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { DeleteExceptionButton } from "./delete-exception-button";

type DailyExceptionsListProps = {
  barberId: string;
};

export async function DailyExceptionsList({
  barberId,
}: DailyExceptionsListProps) {
  const todayStart = startOfToday();

  const exceptions = await prisma.barberDailyAvailability.findMany({
    where: {
      barberId,
      date: {
        gte: todayStart,
      },
    },
    orderBy: {
      date: "asc",
    },
    include: {
      intervals: true,
    },
  });

  if (!exceptions.length) {
    return (
      <section className="space-y-2">
        <h2 className="text-subtitle text-content-primary">
          Exceções na agenda
        </h2>
        <p className="text-paragraph-small-size text-content-secondary">
          Você ainda não criou nenhuma exceção futura. Use o botão{" "}
          <strong>Criar exceção</strong> para bloquear um dia específico ou
          alguns horários.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-subtitle text-content-primary">Exceções na agenda</h2>

      <div className="space-y-2">
        {exceptions.map((ex) => {
          const labelDate = format(ex.date, "EEEE, dd 'de' MMMM", {
            locale: ptBR,
          });

          const isDayOff = ex.type === "DAY_OFF" || ex.intervals.length === 0;

          const description = isDayOff
            ? "Dia inteiro indisponível"
            : ex.intervals
                .sort((a, b) =>
                  a.startTime < b.startTime
                    ? -1
                    : a.startTime > b.startTime
                      ? 1
                      : 0,
                )
                .map((i) => `${i.startTime} - ${i.endTime}`)
                .join(" • ");

          const dateISO = ex.date.toISOString();

          return (
            <div
              key={ex.id}
              className="flex items-center justify-between rounded-xl border border-border-primary bg-background-tertiary px-4 py-3"
            >
              <div className="space-y-1">
                <p className="text-paragraph-medium text-content-primary font-medium">
                  {labelDate}
                </p>
                <p className="text-paragraph-small-size text-content-secondary">
                  {description}
                </p>
              </div>

              <DeleteExceptionButton barberId={barberId} dateISO={dateISO} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
