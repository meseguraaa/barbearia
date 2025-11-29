"use client";

import { useEffect, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { saveWeeklyAvailability } from "@/app/barber/availability/actions";

type DayKey = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = domingo ... 6 = sábado

type DayState = {
  active: boolean;
  startTime: string; // "09:00"
  endTime: string; // "18:00"
};

export type WeeklyAvailabilityState = Record<DayKey, DayState>;

type WeeklyAvailabilityFormProps = {
  initialValue?: WeeklyAvailabilityState;
  onChange?: (value: WeeklyAvailabilityState) => void;
};

const defaultDayState: DayState = {
  active: false,
  startTime: "09:00",
  endTime: "18:00",
};

const WEEK_DAYS: { key: DayKey; label: string; short: string }[] = [
  { key: 1, label: "Segunda-feira", short: "Seg" },
  { key: 2, label: "Terça-feira", short: "Ter" },
  { key: 3, label: "Quarta-feira", short: "Qua" },
  { key: 4, label: "Quinta-feira", short: "Qui" },
  { key: 5, label: "Sexta-feira", short: "Sex" },
  { key: 6, label: "Sábado", short: "Sáb" },
  { key: 0, label: "Domingo", short: "Dom" },
];

// 🔹 Padrão: segunda–sábado ativos, domingo off
function createDefaultState(): WeeklyAvailabilityState {
  return {
    0: { ...defaultDayState, active: false }, // domingo off
    1: { ...defaultDayState, active: true }, // segunda
    2: { ...defaultDayState, active: true }, // terça
    3: { ...defaultDayState, active: true }, // quarta
    4: { ...defaultDayState, active: true }, // quinta
    5: { ...defaultDayState, active: true }, // sexta
    6: { ...defaultDayState, active: true }, // sábado ON
  };
}

export function WeeklyAvailabilityForm({
  initialValue,
  onChange,
}: WeeklyAvailabilityFormProps) {
  const [state, setState] = useState<WeeklyAvailabilityState>(
    initialValue ?? createDefaultState(),
  );

  const [isPending, startTransition] = useTransition();

  // Sempre que o estado mudar, dispara o onChange (se existir)
  useEffect(() => {
    if (onChange) onChange(state);
  }, [state, onChange]);

  const handleToggleDay = (day: DayKey) => {
    setState((prev) => ({
      ...prev,
      [day]: { ...prev[day], active: !prev[day].active },
    }));
  };

  const handleTimeChange = (
    day: DayKey,
    field: "startTime" | "endTime",
    value: string,
  ) => {
    setState((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  const handleCopyMondayToWeekdays = () => {
    const monday = state[1];
    setState((prev) => {
      const next = { ...prev };
      [2, 3, 4, 5].forEach((d) => {
        next[d as DayKey] = {
          ...next[d as DayKey],
          active: monday.active,
          startTime: monday.startTime,
          endTime: monday.endTime,
        };
      });
      return next;
    });
  };

  const handleResetWeek = () => {
    setState(createDefaultState());
  };

  // Verifica se há algum erro de horário em dias ativos
  const hasAnyError = Object.entries(state).some(([_, dayState]) => {
    const d = dayState as DayState;
    return d.active && d.startTime && d.endTime && d.startTime >= d.endTime;
  });

  const handleSave = () => {
    if (hasAnyError) {
      toast.error(
        "Verifique os horários: em dias ativos, o horário inicial deve ser menor que o final.",
      );
      return;
    }

    const daysPayload = Object.entries(state).map(([weekdayStr, dayState]) => {
      const weekday = Number(weekdayStr);
      const d = dayState as DayState;
      return {
        weekday,
        active: d.active,
        startTime: d.startTime,
        endTime: d.endTime,
      };
    });

    startTransition(async () => {
      try {
        await saveWeeklyAvailability({ days: daysPayload });
        toast.success("Disponibilidade semanal salva com sucesso!");
      } catch (error) {
        console.error("Erro ao salvar disponibilidade semanal:", error);
        toast.error("Erro ao salvar disponibilidade. Tente novamente.");
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Ações rápidas + Salvar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyMondayToWeekdays}
            disabled={isPending}
          >
            Copiar segunda para dias úteis
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/5"
            onClick={handleResetWeek}
            disabled={isPending}
          >
            Zerar semana
          </Button>
        </div>

        <Button
          type="button"
          variant="brand"
          size="sm"
          onClick={handleSave}
          disabled={isPending || hasAnyError}
        >
          {isPending ? "Salvando..." : "Salvar padrão semanal"}
        </Button>
      </div>

      {/* Tabela de dias */}
      <div className="overflow-hidden rounded-xl border border-border-primary bg-background-tertiary">
        <div className="grid grid-cols-[1.5fr,auto,1fr,1fr] gap-3 border-b border-border-secondary px-4 py-2 text-label-small text-content-secondary">
          <span>Dia</span>
          <span className="text-center">Trabalha?</span>
          <span>Das</span>
          <span>Até</span>
        </div>

        <div className="divide-y divide-border-secondary">
          {WEEK_DAYS.map((day) => {
            const dayState = state[day.key];

            const hasError =
              dayState.active &&
              dayState.startTime &&
              dayState.endTime &&
              dayState.startTime >= dayState.endTime;

            return (
              <div
                key={day.key}
                className="grid grid-cols-[1.5fr,auto,1fr,1fr] items-center gap-3 px-4 py-3 text-paragraph-small-size"
              >
                {/* Dia */}
                <div className="flex flex-col">
                  <span className="text-content-primary font-medium">
                    {day.label}
                  </span>
                  <span className="text-content-secondary text-[11px] uppercase tracking-wide">
                    {day.short}
                  </span>
                </div>

                {/* Toggle trabalha? */}
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => handleToggleDay(day.key)}
                    disabled={isPending}
                    className={cn(
                      "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                      dayState.active
                        ? "bg-background-brand text-content-on-brand"
                        : "bg-background-primary text-content-secondary border border-border-secondary",
                      isPending && "opacity-60 cursor-not-allowed",
                    )}
                  >
                    {dayState.active ? "Sim" : "Não"}
                  </button>
                </div>

                {/* Das */}
                <div>
                  <Input
                    type="time"
                    value={dayState.startTime}
                    onChange={(e) =>
                      handleTimeChange(day.key, "startTime", e.target.value)
                    }
                    disabled={!dayState.active || isPending}
                    className={cn(
                      "h-9",
                      hasError &&
                        "border-destructive focus-visible:ring-destructive/40",
                    )}
                  />
                </div>

                {/* Até */}
                <div>
                  <Input
                    type="time"
                    value={dayState.endTime}
                    onChange={(e) =>
                      handleTimeChange(day.key, "endTime", e.target.value)
                    }
                    disabled={!dayState.active || isPending}
                    className={cn(
                      "h-9",
                      hasError &&
                        "border-destructive focus-visible:ring-destructive/40",
                    )}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-content-secondary">
        Dica: marque apenas os dias em que você trabalha e ajuste os horários.
        Em breve você poderá criar exceções para dias específicos (folgas,
        eventos, etc.).
      </p>
    </div>
  );
}
