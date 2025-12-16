"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock } from "lucide-react";

type DayKey = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type DayState = {
  active: boolean;
  startTime: string; // "" ou "HH:MM"
  endTime: string; // "" ou "HH:MM"
};

export type UnitWeeklyAvailabilityState = Record<DayKey, DayState>;

export type UnitWeeklyAvailabilityDayPayload = {
  weekday: number;
  active: boolean;
  startTime: string;
  endTime: string;
};

type Props = {
  initialValue?: UnitWeeklyAvailabilityState;
  onChange?: (value: UnitWeeklyAvailabilityState) => void;
  onSave: (payload: {
    days: UnitWeeklyAvailabilityDayPayload[];
  }) => Promise<void>;
  showSaveButton?: boolean;

  // ✅ novo: ações à direita do botão de salvar
  rightAction?: React.ReactNode;
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

// ✅ NOVO PADRÃO (recomendado): admin decide, mas já nasce “dia inteiro”
const defaultDayState: DayState = {
  active: false,
  startTime: "00:00",
  endTime: "23:30",
};

function createDefaultState(): UnitWeeklyAvailabilityState {
  return {
    0: { ...defaultDayState, active: false },
    1: { ...defaultDayState, active: true },
    2: { ...defaultDayState, active: true },
    3: { ...defaultDayState, active: true },
    4: { ...defaultDayState, active: true },
    5: { ...defaultDayState, active: true },
    6: { ...defaultDayState, active: true },
  };
}

// ✅ 00:00 → 23:30 (30 em 30)
const TIME_OPTIONS = (() => {
  const times: string[] = [];
  for (let hour = 0; hour <= 23; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      times.push(
        `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      );
    }
  }
  return times; // inclui 23:30
})();

function isBlank(v: string) {
  return !v || v.trim().length === 0;
}

export function UnitWeeklyAvailabilityForm({
  initialValue,
  onChange,
  onSave,
  showSaveButton = true,
  rightAction,
}: Props) {
  const [state, setState] = useState<UnitWeeklyAvailabilityState>(
    initialValue ?? createDefaultState(),
  );

  const [isPending, startTransition] = useTransition();

  // se o server mandar outro initialValue, atualiza o estado local
  useEffect(() => {
    if (initialValue) setState(initialValue);
  }, [initialValue]);

  useEffect(() => {
    onChange?.(state);
  }, [state, onChange]);

  const dayErrors = useMemo(() => {
    const map: Record<number, { missingTime: boolean; invalidRange: boolean }> =
      {};

    for (const [weekdayStr, d] of Object.entries(state)) {
      const weekday = Number(weekdayStr);

      const missingTime =
        d.active && (isBlank(d.startTime) || isBlank(d.endTime));

      const invalidRange =
        d.active &&
        !isBlank(d.startTime) &&
        !isBlank(d.endTime) &&
        d.startTime >= d.endTime;

      map[weekday] = { missingTime, invalidRange };
    }

    return map;
  }, [state]);

  const hasAnyError = useMemo(
    () => Object.values(dayErrors).some((e) => e.missingTime || e.invalidRange),
    [dayErrors],
  );

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

  const handleSave = () => {
    if (hasAnyError) {
      toast.error(
        "Preencha corretamente os horários de todos os dias ativos antes de salvar.",
      );
      return;
    }

    const daysPayload: UnitWeeklyAvailabilityDayPayload[] = Object.entries(
      state,
    ).map(([weekdayStr, d]) => ({
      weekday: Number(weekdayStr),
      active: d.active,
      startTime: d.startTime,
      endTime: d.endTime,
    }));

    startTransition(async () => {
      try {
        await onSave({ days: daysPayload });
        toast.success("Horário da unidade salvo com sucesso!");
      } catch (err) {
        console.error(err);
        toast.error("Erro ao salvar horário da unidade.");
      }
    });
  };

  return (
    <div className="space-y-4">
      {showSaveButton && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* ✅ aqui entra o botão/modal de exceção */}
          {rightAction}

          <Button
            type="button"
            variant="edit2"
            size="sm"
            onClick={handleSave}
            disabled={isPending || hasAnyError}
          >
            {isPending ? "Salvando..." : "Salvar padrão semanal"}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {WEEK_DAYS.map((day) => {
          const d = state[day.key];
          const err = dayErrors[day.key];

          return (
            <div
              key={day.key}
              className={cn(
                "flex flex-col rounded-xl border px-3 py-3 transition-colors",
                d.active
                  ? "border-border-brand bg-background-tertiary/80"
                  : "border-border-secondary bg-background-tertiary",
                (err?.missingTime || err?.invalidRange) && "border-destructive",
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="font-medium text-content-primary">
                    {day.short}
                  </p>
                  <p className="text-[11px] text-content-secondary">
                    {day.label}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleDay(day.key)}
                  disabled={isPending}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-medium transition-opacity",
                    d.active
                      ? "bg-background-brand text-content-on-brand"
                      : "border border-border-secondary text-content-secondary",
                    isPending && "opacity-60 cursor-not-allowed",
                  )}
                >
                  {d.active ? "Sim" : "Não"}
                </button>
              </div>

              <div className="mt-auto space-y-2">
                <Select
                  value={d.startTime}
                  onValueChange={(v) =>
                    handleTimeChange(day.key, "startTime", v)
                  }
                  disabled={!d.active || isPending}
                >
                  <SelectTrigger
                    className={cn(
                      "h-9 bg-background-tertiary",
                      err?.missingTime || err?.invalidRange
                        ? "border-destructive"
                        : "border-border-primary",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <SelectValue placeholder="-- : --" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={d.endTime}
                  onValueChange={(v) => handleTimeChange(day.key, "endTime", v)}
                  disabled={!d.active || isPending}
                >
                  <SelectTrigger
                    className={cn(
                      "h-9 bg-background-tertiary",
                      err?.missingTime || err?.invalidRange
                        ? "border-destructive"
                        : "border-border-primary",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <SelectValue placeholder="-- : --" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {err?.missingTime && (
                  <p className="text-[11px] text-destructive">
                    Defina início e fim
                  </p>
                )}
                {err?.invalidRange && (
                  <p className="text-[11px] text-destructive">
                    Início deve ser menor que o fim
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
