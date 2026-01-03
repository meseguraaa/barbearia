"use client";

import type { Barber } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { ServiceStatusBadge } from "@/components/service-status-badge";
import { toggleBarberStatus } from "@/app/admin/professional/actions";
import { ProfessionalEditDialog } from "@/components/professional-edit-dialog";

/**
 * Mesma estrutura usada nos dialogs de profissional/unidade
 * (mantendo aqui pra não depender de outro import)
 */
type UnitOption = {
  id: string;
  name: string;
  isActive: boolean;
};

export type AdminProfessionalRowData = Barber & {
  avatarUrl: string | null;
  weeklyScheduleLabel: string;
  exceptionsLabel: string;

  // 🔹 nova propriedade opcional, usada quando já temos a URL da imagem
  imageUrl?: string | null;

  // 🔹 ids das unidades já vinculadas (se o backend já montar isso)
  selectedUnitIds?: string[];
};

type ProfessionalRowProps = {
  row: AdminProfessionalRowData;

  /**
   * Lista de unidades disponíveis pra associar no dialog.
   * Deixo opcional pra não quebrar quem ainda não passou isso no map.
   */
  units?: UnitOption[];
};

export function ProfessionalRow({ row, units = [] }: ProfessionalRowProps) {
  // Prioriza imageUrl, depois avatarUrl, depois inicial do nome
  const avatarToShow = row.imageUrl ?? row.avatarUrl ?? null;

  // Unidades selecionadas (se não vier, vai vazio)
  const selectedUnitIds = row.selectedUnitIds ?? [];

  return (
    <tr className="border-b border-border-primary last:border-b-0">
      {/* PROFISSIONAL (foto + nome + email + telefone) */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="h-10 w-10 overflow-hidden rounded-full bg-background-secondary border border-border-primary flex items-center justify-center text-xs font-medium text-content-secondary">
            {avatarToShow ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarToShow}
                alt={row.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span>{(row.name || "?").charAt(0).toUpperCase()}</span>
            )}
          </div>

          {/* Infos do profissional */}
          <div className="flex flex-col">
            <span className="text-paragraph-medium text-content-primary font-medium">
              {row.name}
            </span>
            <span className="text-paragraph-small text-content-secondary">
              {row.email || "Sem e-mail"}
            </span>
            <span className="text-paragraph-small text-content-secondary">
              {row.phone || "Sem telefone"}
            </span>
          </div>
        </div>
      </td>

      {/* ESCALA (resumo semanal) */}
      <td className="px-4 py-3 text-paragraph-small text-content-primary">
        {row.weeklyScheduleLabel}
      </td>

      {/* EXCEÇÕES (resumo de folgas/ajustes) */}
      <td className="px-4 py-3 text-paragraph-small text-content-primary">
        {row.exceptionsLabel}
      </td>

      {/* STATUS usando ServiceStatusBadge */}
      <td className="px-4 py-3 text-center">
        <ServiceStatusBadge isActive={row.isActive} />
      </td>

      {/* AÇÕES (Editar + Ativar/Desativar) */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          {/* EDITAR */}
          <ProfessionalEditDialog
            barber={{
              id: row.id,
              name: row.name,
              email: row.email,
              phone: row.phone ?? null,
              isActive: row.isActive,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
              userId: row.userId,
              imageUrl: row.imageUrl ?? row.avatarUrl ?? null,
            }}
            units={units}
            selectedUnitIds={selectedUnitIds}
          />

          {/* ATIVAR / DESATIVAR */}
          <form action={toggleBarberStatus}>
            <input type="hidden" name="barberId" value={row.id} />
            <Button
              variant={row.isActive ? "destructive" : "active"}
              size="sm"
              type="submit"
              className="border-border-primary hover:bg-muted/40"
            >
              {row.isActive ? "Desativar" : "Ativar"}
            </Button>
          </form>
        </div>
      </td>
    </tr>
  );
}
