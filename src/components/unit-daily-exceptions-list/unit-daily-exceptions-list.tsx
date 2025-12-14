import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { UnitDailyExceptionDeleteButton } from "@/components/unit-daily-exception-delete-button/unit-daily-exception-delete-button";

type Props = {
  unitId: string;
};

export async function UnitDailyExceptionsList({ unitId }: Props) {
  const exceptions = await prisma.unitDailyAvailability.findMany({
    where: { unitId },
    include: { intervals: true },
    orderBy: { date: "asc" },
  });

  if (exceptions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-secondary px-4 py-6 text-center text-paragraph-small-size text-content-secondary">
        Nenhuma exceção cadastrada para esta unidade.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {exceptions.map((ex) => {
        const dateLabel = format(ex.date, "EEEE, dd 'de' MMMM", {
          locale: ptBR,
        });

        // ✅ UnitDailyAvailability não tem `type`; usa `isClosed`
        const isDayOff = ex.isClosed === true;

        return (
          <div
            key={ex.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-border-primary bg-background-tertiary px-4 py-3"
          >
            <div className="space-y-1">
              <p className="font-medium text-content-primary">{dateLabel}</p>

              {isDayOff ? (
                <p className="text-paragraph-small-size text-content-destructive">
                  Unidade fechada o dia inteiro
                </p>
              ) : ex.intervals.length === 0 ? (
                <p className="text-paragraph-small-size text-content-secondary">
                  Exceção sem intervalos cadastrados.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2 text-[12px]">
                  {ex.intervals.map((i) => (
                    <li
                      key={i.id}
                      className="rounded-full bg-background-secondary px-2 py-0.5"
                    >
                      {i.startTime} - {i.endTime}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <UnitDailyExceptionDeleteButton
              unitId={unitId}
              dateISO={ex.date.toISOString()}
            />
          </div>
        );
      })}
    </div>
  );
}
