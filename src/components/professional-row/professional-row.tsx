import type { Barber } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { ServiceStatusBadge } from "@/components/service-status-badge";
import { toggleBarberStatus } from "@/app/admin/professional/actions";
import { ProfessionalEditDialog } from "@/components/professional-edit-dialog";

type ProfessionalRowProps = {
  barber: Barber;
};

export function ProfessionalRow({ barber }: ProfessionalRowProps) {
  return (
    <tr className="border-t border-border-primary">
      <td className="px-4 py-3">{barber.name}</td>
      <td className="px-4 py-3">{barber.email}</td>
      <td className="px-4 py-3">{barber.phone ?? "-"}</td>

      {/* STATUS usando ServiceStatusBadge */}
      <td className="px-4 py-3">
        <ServiceStatusBadge isActive={barber.isActive} />
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          {/* EDITAR */}
          <ProfessionalEditDialog barber={barber} />

          {/* ATIVAR / DESATIVAR */}
          <form action={toggleBarberStatus}>
            <input type="hidden" name="barberId" value={barber.id} />
            <Button
              variant={barber.isActive ? "destructive" : "active"}
              size="sm"
              type="submit"
              className="border-border-primary hover:bg-muted/40"
            >
              {barber.isActive ? "Desativar" : "Ativar"}
            </Button>
          </form>
        </div>
      </td>
    </tr>
  );
}
