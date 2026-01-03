"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { AppointmentForm } from "@/components/appointment-form";
import type {
  AppointmentClientOption,
  UnitOption,
} from "@/components/appointment-form";
import type { Appointment } from "@/types/appointment";
import type { Service } from "@/types/service";
import { toast } from "sonner";

type Props = {
  clients: AppointmentClientOption[];
  appointments: Appointment[];
  barbers: any[];
  services: Service[];

  /**
   * ✅ Unidade ativa do admin (já resolvida no page).
   * - string = unidade selecionada
   * - null = "all" (ver todas)
   *
   * Importante: admin dono pode abrir o form e escolher a unidade lá dentro.
   */
  unitId: string | null;

  // ✅ unidades disponíveis (pra exibir label e permitir seleção no form)
  units?: UnitOption[];
};

export function AdminNewAppointmentButton({
  clients,
  appointments,
  barbers,
  services,
  unitId,
  units = [],
}: Props) {
  const [open, setOpen] = useState(false);

  // ✅ Quando o admin troca a unidade (no cookie/contexto),
  // a gente fecha o modal e força o form “resetar” estado interno.
  useEffect(() => {
    setOpen(false);
  }, [unitId]);

  // ✅ Se não tem unitId (modo "all") mas só existe 1 unidade, podemos "forçar" essa unidade.
  const effectiveForcedUnitId = useMemo(() => {
    if (unitId) return unitId;

    const activeUnits = (units ?? []).filter((u) => u.isActive !== false);
    if (activeUnits.length === 1) return activeUnits[0].id;

    return undefined;
  }, [unitId, units]);

  // ✅ Força remount quando a unidade (ou o "auto-force") mudar
  const formKey = useMemo(
    () => effectiveForcedUnitId ?? "all",
    [effectiveForcedUnitId],
  );

  // ✅ Regra de abertura:
  // - Admin de unidade (unitId definido): abre normal
  // - Dono (unitId null): deixa abrir e escolher unidade no form
  const canOpen = true;

  return (
    <>
      <Button
        variant="brand"
        onClick={() => {
          if (!canOpen) return;

          // Se estiver em "all" e não houver unidade efetiva forçada,
          // a escolha da unidade deve acontecer no form.
          const activeUnits = (units ?? []).filter((u) => u.isActive !== false);

          if (!unitId && !effectiveForcedUnitId && activeUnits.length > 1) {
            toast.message("Escolha uma unidade no formulário para agendar.");
          } else if (
            !unitId &&
            !effectiveForcedUnitId &&
            activeUnits.length === 0
          ) {
            toast.error("Nenhuma unidade ativa encontrada para agendar.");
            return;
          }

          setOpen(true);
        }}
      >
        Agendar
      </Button>

      <AppointmentForm
        key={formKey} // ✅ força remount quando a unidade efetiva mudar (zera estado do form)
        mode="admin"
        open={open}
        onOpenChange={setOpen}
        clients={clients}
        appointments={appointments}
        barbers={barbers}
        services={services}
        units={units}
        forcedUnitId={effectiveForcedUnitId} // ✅ undefined quando dono precisa escolher
      >
        {/* IMPORTANTE:
            Passamos um trigger invisível só pra impedir o AppointmentForm
            de renderizar o botão padrão ("Agendar"). */}
        <span className="hidden" aria-hidden="true" />
      </AppointmentForm>
    </>
  );
}
