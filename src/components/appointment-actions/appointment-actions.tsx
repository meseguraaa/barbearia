"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  concludeAppointment,
  cancelAppointment,
} from "@/app/admin/dashboard/actions";
import type { AppointmentStatus } from "@/types/appointment";

type AppointmentActionsProps = {
  appointmentId: string;
  status?: AppointmentStatus | null;
};

export function AppointmentActions({
  appointmentId,
  status,
}: AppointmentActionsProps) {
  const [isPending, startTransition] = useTransition();

  function handleConclude() {
    startTransition(async () => {
      await concludeAppointment(appointmentId);
    });
  }

  function handleCancel() {
    startTransition(async () => {
      await cancelAppointment(appointmentId);
    });
  }

  const isPendingStatus = status === "PENDING";
  const isCanceledStatus = status === "CANCELED";

  return (
    <div className="flex items-center gap-2">
      {/* CONCLUIR – só faz sentido para pendente */}
      {(!status || isPendingStatus) && (
        <Button
          size="sm"
          className="bg-green-600 hover:bg-green-700 text-white"
          onClick={handleConclude}
          disabled={isPending}
        >
          Concluir
        </Button>
      )}

      {/* CANCELAR – não mostra se já estiver cancelado */}
      {(!status || !isCanceledStatus) && (
        <Button
          size="sm"
          variant="destructive"
          onClick={handleCancel}
          disabled={isPending}
        >
          Cancelar
        </Button>
      )}
    </div>
  );
}
