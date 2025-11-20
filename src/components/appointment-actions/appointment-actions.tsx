"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAppointment } from "@/app/admin/dashboard/actions";
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

type AppointmentActionsProps = {
  appointmentId: string;
};

export function AppointmentActions({ appointmentId }: AppointmentActionsProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleConfirmDelete() {
    const formData = new FormData();
    formData.append("id", appointmentId);

    startTransition(async () => {
      await deleteAppointment(formData);
      router.refresh();
      setOpen(false);
    });
  }

  return (
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
  );
}
