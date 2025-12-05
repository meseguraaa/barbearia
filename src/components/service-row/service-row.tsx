import type { Service } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { ServiceStatusBadge } from "@/components/service-status-badge";
import { toggleServiceStatus } from "@/app/admin/services/actions";
import { ServiceEditDialog } from "@/components/service-edit-dialog";

type ServiceRowProps = {
  service: Service;
};

export function ServiceRow({ service }: ServiceRowProps) {
  const rawBarberPercentage = (service as any).barberPercentage as
    | number
    | null
    | undefined;

  const barberPercentage =
    rawBarberPercentage !== undefined && rawBarberPercentage !== null
      ? Number(rawBarberPercentage)
      : null;

  const rawCancelLimitHours = (service as any).cancelLimitHours as
    | number
    | null
    | undefined;
  const cancelLimitHours =
    rawCancelLimitHours !== undefined && rawCancelLimitHours !== null
      ? Number(rawCancelLimitHours)
      : null;

  const rawCancelFeePercentage = (service as any).cancelFeePercentage as
    | number
    | null
    | undefined;
  const cancelFeePercentage =
    rawCancelFeePercentage !== undefined && rawCancelFeePercentage !== null
      ? Number(rawCancelFeePercentage)
      : null;

  return (
    <tr className="border-t border-border-primary">
      <td className="px-4 py-3">{service.name}</td>
      <td className="px-4 py-3">R$ {Number(service.price).toFixed(2)}</td>
      <td className="px-4 py-3">{service.durationMinutes} min</td>

      {/* PORCENTAGEM DO BARBEIRO */}
      <td className="px-4 py-3">
        {barberPercentage !== null ? `${barberPercentage}%` : "-"}
      </td>

      {/* LIMITE DE CANCELAMENTO */}
      <td className="px-4 py-3">
        {cancelLimitHours !== null ? `Até ${cancelLimitHours}h antes` : "—"}
      </td>

      {/* TAXA DE CANCELAMENTO */}
      <td className="px-4 py-3">
        {cancelFeePercentage !== null ? `${cancelFeePercentage}%` : "—"}
      </td>

      <td className="px-4 py-3">
        <ServiceStatusBadge isActive={service.isActive} />
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          {/* EDITAR */}
          <ServiceEditDialog service={service} />

          {/* ATIVAR / DESATIVAR */}
          <form action={toggleServiceStatus}>
            <input type="hidden" name="serviceId" value={service.id} />
            <Button
              variant={service.isActive ? "destructive" : "active"}
              size="sm"
              type="submit"
              className="border-border-primary hover:bg-muted/40"
            >
              {service.isActive ? "Desativar" : "Ativar"}
            </Button>
          </form>
        </div>
      </td>
    </tr>
  );
}
