// app/barber/availability/daily-exception-delete-button.tsx
"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { deleteDailyException } from "../../app/barber/availability/actions";

type DailyExceptionDeleteButtonProps = {
  barberId: string;
  dateISO: string;
};

export function DailyExceptionDeleteButton({
  barberId,
  dateISO,
}: DailyExceptionDeleteButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      try {
        const result = await deleteDailyException(barberId, dateISO);

        if (result && "error" in result && result.error) {
          toast.error(result.error);
          return;
        }

        toast.success(
          "Exceção removida! O dia voltará a seguir o padrão semanal.",
        );
      } catch (error) {
        console.error("Erro ao remover exceção diária", error);
        toast.error("Falha ao remover exceção. Tente novamente.");
      }
    });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm">
          Excluir
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover exceção deste dia?</AlertDialogTitle>
          <AlertDialogDescription>
            Este dia voltará a seguir apenas o padrão semanal de
            disponibilidade. Os horários customizados serão apagados.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>

          {/* ⚠️ Aqui está o truque: usamos Button DENTRO do Action */}
          <AlertDialogAction asChild>
            <Button
              onClick={handleDelete}
              disabled={isPending}
              variant="destructive"
            >
              {isPending ? "Removendo..." : "Remover exceção"}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
