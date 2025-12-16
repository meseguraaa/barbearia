"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock } from "lucide-react";

type DayKey = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = domingo ... 6 = sábado

type DayState = {
  active: boolean;
  startTime: string; // "00:00"
  endTime: string; // "23:30"
};

export type WeeklyAvailabilityState = Record<DayKey, DayState>;

export type WeeklyAvailabilityDayPayload = {
  weekday: number;
  active: boolean;
  startTime: string;
  endTime: string;
};

type WeeklyAvailabilityFormProps = {
  initialValue?: WeeklyAvailabilityState;
  onChange?: (value: WeeklyAvailabilityState) => void;

  // ✅ quem usa o componente decide como salvar (action server-side, api, etc.)
  onSave: (payload: { days: WeeklyAvailabilityDayPayload[] }) => Promise<void>;

  // ✅ opcional: controlar loading externamente (wrapper)
  isSaving?: boolean;
};

// ✅ NOVO PADRÃO: dia inteiro disponível (admin/profissional decide)
const defaultDayState: DayState = {
  active: false,
  startTime: "00:00",
  endTime: "23:30",
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

// ✅ NOVO: 00:00 até 23:30, de 30 em 30
const TIME_OPTIONS = (() => {
  const times: string[] = [];
  for (let hour = 0; hour <= 23; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const timeString = `${hour.toString().padStart(2, "0")}:${minute
        .toString()
        .padStart(2, "0")}`;
      times.push(timeString);
    }
  }
  return times; // inclui 23:30
})();

export function WeeklyAvailabilityForm({
  initialValue,
  onChange,
  onSave,
  isSaving = false,
}: WeeklyAvailabilityFormProps) {
  const [state, setState] = useState<WeeklyAvailabilityState>(
    initialValue ?? createDefaultState(),
  );

  // ✅ se o initialValue mudar (ex: troca de unidade / reload), sincroniza
  useEffect(() => {
    if (initialValue) setState(initialValue);
  }, [initialValue]);

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

  const hasAnyError = Object.entries(state).some(([_, dayState]) => {
    const d = dayState as DayState;
    return d.active && d.startTime && d.endTime && d.startTime >= d.endTime;
  });

  const handleSave = async () => {
    if (hasAnyError) return;

    const daysPayload: WeeklyAvailabilityDayPayload[] = Object.entries(
      state,
    ).map(([weekdayStr, dayState]) => {
      const weekday = Number(weekdayStr);
      const d = dayState as DayState;

      return {
        weekday,
        active: d.active,
        startTime: d.startTime,
        endTime: d.endTime,
      };
    });

    await onSave({ days: daysPayload });
  };

  return (
    <div className="space-y-4">
      {/* Botão salvar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="brand"
          size="sm"
          onClick={handleSave}
          disabled={isSaving || hasAnyError}
        >
          {isSaving ? "Salvando..." : "Salvar padrão semanal"}
        </Button>
      </div>

      {/* Dias em grid (lado a lado) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
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
              className={cn(
                "flex flex-col rounded-xl border px-3 py-3 text-paragraph-small-size transition-colors",
                dayState.active
                  ? "border-border-brand bg-background-tertiary/80"
                  : "border-border-secondary bg-background-tertiary",
              )}
            >
              {/* Cabeçalho do dia */}
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-content-primary font-medium">
                    {day.short}
                  </span>
                  <span className="text-[11px] text-content-primary">
                    {day.label}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleDay(day.key)}
                  disabled={isSaving}
                  className={cn(
                    "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                    dayState.active
                      ? "bg-background-brand text-content-on-brand"
                      : "bg-background-primary text-content-secondary border border-border-secondary",
                    isSaving && "opacity-60 cursor-not-allowed",
                  )}
                >
                  {dayState.active ? "Sim" : "Não"}
                </button>
              </div>

              {/* Inputs de horário (dropdowns) */}
              <div className="mt-auto space-y-2">
                {/* Das */}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-content-primary">Das</span>
                  <Select
                    value={dayState.startTime}
                    onValueChange={(value) =>
                      handleTimeChange(day.key, "startTime", value)
                    }
                    disabled={!dayState.active || isSaving}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-9 w-full justify-between text-left font-normal bg-background-tertiary border-border-primary text-content-primary focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand focus:border-border-brand focus-visible:border-border-brand",
                        hasError &&
                          "border-destructive focus-visible:ring-destructive/40",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-content-brand" />
                        <SelectValue placeholder="Horário inicial" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Até */}
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-content-primary">Até</span>
                  <Select
                    value={dayState.endTime}
                    onValueChange={(value) =>
                      handleTimeChange(day.key, "endTime", value)
                    }
                    disabled={!dayState.active || isSaving}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-9 w-full justify-between text-left font-normal bg-background-tertiary border-border-primary text-content-primary focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand focus:border-border-brand focus-visible:border-border-brand",
                        hasError &&
                          "border-destructive focus-visible:ring-destructive/40",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-content-brand" />
                        <SelectValue placeholder="Horário final" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-content-secondary">
        Marque apenas os dias em que você trabalha e ajuste os horários. As
        exceções por dia (folgas, eventos, etc.) são configuradas logo abaixo.
      </p>

      {hasAnyError && (
        <p className="text-[11px] text-destructive">
          Em dias ativos, o horário inicial deve ser menor que o final.
        </p>
      )}
    </div>
  );
}
