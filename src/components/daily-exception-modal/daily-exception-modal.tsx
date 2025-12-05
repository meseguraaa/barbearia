"use client";

import { useState, useTransition } from "react";
import { format, startOfToday } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { CalendarIcon, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { createDailyException } from "../../app/barber/availability/actions";

// mesmos limites da barbearia (09:00 - 21:00), de 30 em 30
const TIME_OPTIONS = (() => {
  const times: string[] = [];
  for (let hour = 9; hour <= 21; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      if (hour === 21 && minute > 0) break;
      times.push(
        `${hour.toString().padStart(2, "0")}:${minute
          .toString()
          .padStart(2, "0")}`,
      );
    }
  }
  return times;
})();

type ExceptionInterval = {
  id: string;
  startTime: string;
  endTime: string;
};

type DailyExceptionModalProps = {
  barberId: string;
};

export function DailyExceptionModal({ barberId }: DailyExceptionModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>();
  const [mode, setMode] = useState<"FULL_DAY" | "PARTIAL">("FULL_DAY");
  const [intervals, setIntervals] = useState<ExceptionInterval[]>([
    {
      id: "1",
      startTime: "09:00",
      endTime: "19:00",
    },
  ]);

  const [isPending, startTransition] = useTransition();

  function resetState() {
    setDate(undefined);
    setMode("FULL_DAY");
    setIntervals([
      {
        id: "1",
        startTime: "09:00",
        endTime: "19:00",
      },
    ]);
  }

  function handleAddInterval() {
    const nextId = String(Date.now());
    setIntervals((prev) => [
      ...prev,
      { id: nextId, startTime: "09:00", endTime: "18:00" },
    ]);
  }

  function handleRemoveInterval(id: string) {
    setIntervals((prev) => prev.filter((i) => i.id !== id));
  }

  function updateInterval(
    id: string,
    field: "startTime" | "endTime",
    value: string,
  ) {
    setIntervals((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)),
    );
  }

  function handleSubmit() {
    if (!date) {
      toast.error("Selecione uma data para criar a exceção.");
      return;
    }

    startTransition(async () => {
      try {
        const payload =
          mode === "FULL_DAY"
            ? {
                barberId,
                dateISO: date.toISOString(),
                mode: "FULL_DAY" as const,
                intervals: [],
              }
            : {
                barberId,
                dateISO: date.toISOString(),
                mode: "PARTIAL" as const,
                intervals: intervals.map((i) => ({
                  startTime: i.startTime,
                  endTime: i.endTime,
                })),
              };

        const result = await createDailyException(payload);

        if (result && "error" in result && result.error) {
          toast.error(result.error);
          return;
        }

        toast.success("Exceção criada com sucesso!");
        resetState();
        setIsOpen(false);
      } catch (error) {
        console.error("Erro ao criar exceção diária", error);
        toast.error("Falha ao criar exceção. Tente novamente.");
      }
    });
  }

  const isSaving = isPending;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) resetState();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="brand">Criar exceção</Button>
      </DialogTrigger>

      <DialogContent
        variant="appointment"
        overlayVariant="blurred"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle size="modal">Criar exceção na agenda</DialogTitle>
          <DialogDescription size="modal">
            Bloqueie um dia inteiro ou faixas de horário específicas. A agenda
            vai respeitar essas exceções acima do padrão semanal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* DATA */}
          <div className="space-y-2">
            <span className="text-label-medium-size text-content-primary">
              Dia da exceção
            </span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-between text-left font-normal bg-background-tertiary border-border-primary text-content-primary hover:bg-background-tertiary hover:border-border-secondary hover:text-content-primary focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand focus:border-border-brand focus-visible:border-border-brand",
                    !date && "text-content-secondary",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="text-content-brand" size={20} />
                    {date ? (
                      <span>
                        {format(date, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                      </span>
                    ) : (
                      <span>Selecione uma data</span>
                    )}
                  </div>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => setDate(d ?? undefined)}
                  disabled={(d) => d < startOfToday()}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* MODO */}
          <div className="space-y-2">
            <span className="text-label-medium-size text-content-primary">
              Tipo de exceção
            </span>
            <Select
              value={mode}
              onValueChange={(v: "FULL_DAY" | "PARTIAL") => setMode(v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FULL_DAY">
                  Dia inteiro indisponível
                </SelectItem>
                <SelectItem value="PARTIAL">
                  Indisponível em horários específicos
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* INTERVALOS (só se PARTIAL) */}
          {mode === "PARTIAL" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-label-medium-size text-content-primary">
                  Horários indisponíveis
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAddInterval}
                >
                  + Adicionar intervalo
                </Button>
              </div>

              <div className="space-y-2">
                {intervals.map((interval, index) => (
                  <div
                    key={interval.id}
                    className="grid grid-cols-[1fr,1fr,auto] items-center gap-2"
                  >
                    <div className="space-y-1">
                      <span className="text-label-small text-content-secondary">
                        Início
                      </span>
                      <Select
                        value={interval.startTime}
                        onValueChange={(v) =>
                          updateInterval(interval.id, "startTime", v)
                        }
                      >
                        <SelectTrigger>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-content-brand" />
                            <SelectValue placeholder="Horário inicial" />
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
                    </div>

                    <div className="space-y-1">
                      <span className="text-label-small text-content-secondary">
                        Fim
                      </span>
                      <Select
                        value={interval.endTime}
                        onValueChange={(v) =>
                          updateInterval(interval.id, "endTime", v)
                        }
                      >
                        <SelectTrigger>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-content-brand" />
                            <SelectValue placeholder="Horário final" />
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
                    </div>

                    <div className="flex items-end justify-end pb-0.5">
                      {intervals.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveInterval(interval.id)}
                        >
                          ✕
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Só pra deixar claro pro barbeiro */}
              <p className="text-paragraph-small-size text-content-secondary">
                Esses horários serão <strong>bloqueados</strong>. O restante do
                dia ainda poderá receber agendamentos, seguindo o padrão
                semanal.
              </p>
            </div>
          )}

          {/* AÇÕES */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                resetState();
                setIsOpen(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="brand"
              onClick={handleSubmit}
              disabled={isSaving}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar exceção
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
