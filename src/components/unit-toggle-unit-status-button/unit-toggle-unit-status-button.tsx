"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { toggleUnitStatus } from "@/app/admin/settings/units/actions";

type Props = {
  unitId: string;
  isActive: boolean;
  size?: "default" | "sm" | "lg" | "icon";
};

export function UnitToggleUnitStatusButton({
  unitId,
  isActive,
  size = "sm",
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        await toggleUnitStatus({ unitId });

        toast.success(isActive ? "Unidade desativada." : "Unidade ativada.");
        router.refresh(); // ✅ move entre listas (server refetch)
      } catch (err) {
        console.error(err);
        toast.error("Não foi possível alterar o status da unidade.");
      }
    });
  }

  return (
    <Button
      type="button"
      variant={isActive ? "destructive" : "active"}
      size={size}
      onClick={handleClick}
      disabled={isPending}
    >
      {isPending ? "Salvando..." : isActive ? "Desativar" : "Ativar"}
    </Button>
  );
}
