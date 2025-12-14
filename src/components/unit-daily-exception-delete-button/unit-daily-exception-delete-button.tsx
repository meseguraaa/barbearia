"use client";

import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteUnitDailyException } from "@/app/admin/settings/units/daily-exceptions/actions";

type Props = {
  unitId: string;
  dateISO: string;
};

export function UnitDailyExceptionDeleteButton({ unitId, dateISO }: Props) {
  async function handleDelete() {
    try {
      await deleteUnitDailyException({ unitId, dateISO });
      toast.success("Exceção removida.");
    } catch {
      toast.error("Erro ao remover exceção.");
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleDelete}
      title="Remover exceção"
    >
      <Trash2 className="h-4 w-4 text-content-secondary" />
    </Button>
  );
}
