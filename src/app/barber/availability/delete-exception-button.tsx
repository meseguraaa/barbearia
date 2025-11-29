"use client";

import { useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteDailyException } from "./actions";

type DeleteExceptionButtonProps = {
  barberId: string;
  dateISO: string;
};

export function DeleteExceptionButton({
  barberId,
  dateISO,
}: DeleteExceptionButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        const result = await deleteDailyException(barberId, dateISO);

        if (result && "error" in result && result.error) {
          toast.error(result.error);
          return;
        }

        toast.success(
          "Exceção removida. O dia volta a seguir o padrão semanal.",
        );
      } catch (error) {
        console.error("Erro ao remover exceção diária", error);
        toast.error("Falha ao remover exceção. Tente novamente.");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="destructive"
      size="icon"
      onClick={handleClick}
      disabled={isPending}
      title="Remover exceção"
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
    </Button>
  );
}
