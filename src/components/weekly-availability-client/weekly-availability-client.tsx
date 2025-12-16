"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { WeeklyAvailabilityForm } from "@/components/weekly-availability-form/weekly-availability-form";
import type {
  WeeklyAvailabilityDayPayload,
  WeeklyAvailabilityState,
} from "@/components/weekly-availability-form/weekly-availability-form";

import { saveWeeklyAvailability } from "@/app/barber/availability/actions";

type WeeklyAvailabilityClientProps = {
  initialValue: WeeklyAvailabilityState;

  // ✅ NOVO: permite passar o botão/modal de exceção pra ficar ao lado do salvar
  leftAction?: React.ReactNode;
};

export function WeeklyAvailabilityClient({
  initialValue,
  leftAction,
}: WeeklyAvailabilityClientProps) {
  const [, startTransition] = useTransition();

  function handleSave(payload: {
    days: WeeklyAvailabilityDayPayload[];
  }): Promise<void> {
    return new Promise((resolve) => {
      startTransition(async () => {
        try {
          await saveWeeklyAvailability(payload);
          toast.success("Disponibilidade salva!");
        } catch (err: any) {
          toast.error(err?.message ?? "Erro ao salvar disponibilidade.");
        } finally {
          resolve();
        }
      });
    });
  }

  return (
    <WeeklyAvailabilityForm
      initialValue={initialValue}
      onSave={handleSave}
      leftAction={leftAction}
    />
  );
}
