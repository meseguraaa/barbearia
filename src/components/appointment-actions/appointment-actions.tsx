"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  concludeAppointment,
  cancelAppointment,
  deleteAppointment,
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
  const [open, setOpen] = useState(false);
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

  function handleConfirmDelete() {
    startTransition(async () => {
      await deleteAppointment(appointmentId);
      setOpen(false);
    });
  }

  const isPendingStatus = status === "PENDING";
  const isCanceledStatus = status === "CANCELED";

  return (
    <div className="flex items-center gap-2">
      {/* CONCLUIR – só faz sentido para pendente.
          Enquanto não passarmos o status pela página, ele vai aparecer sempre.
          Quando a página mandar `status`, ele respeita certinho. */}
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
          variant="outline"
          className="border-red-300 text-red-600 hover:bg-red-50"
          onClick={handleCancel}
          disabled={isPending}
        >
          Cancelar
        </Button>
      )}

      {/* EXCLUIR – com modal de confirmação */}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="border-destructive/60 text-destructive hover:bg-destructive/10"
          >
            Excluir
          </Button>
        </AlertDialogTrigger>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. O agendamento será removido
              permanentemente do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleConfirmDelete}
                disabled={isPending}
              >
                {isPending ? "Excluindo..." : "Confirmar exclusão"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
