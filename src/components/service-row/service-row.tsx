// src/components/service-row.tsx
import type { Service } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { ServiceStatusBadge } from "@/components/service-status-badge";
import { toggleServiceStatus } from "@/app/admin/services/actions";
import { ServiceEditDialog } from "@/components/service-edit-dialog";

type ServiceRowProps = {
  service: Service;
};

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function ServiceRow({ service }: ServiceRowProps) {
  // Campos opcionais/compat que podem vir como Decimal/string/number
  const barberPercentage = toNumberOrNull((service as any).barberPercentage);
  const cancelLimitHours = toNumberOrNull((service as any).cancelLimitHours);
  const cancelFeePercentage = toNumberOrNull(
    (service as any).cancelFeePercentage,
  );

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
