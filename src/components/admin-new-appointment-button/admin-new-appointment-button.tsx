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
   * - null = "all" (ver todas) -> não pode agendar sem escolher uma unidade específica
   */
  unitId: string | null;

  // ✅ NOVO: unidades disponíveis (pra exibir label corretamente no form)
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

  const formKey = useMemo(() => unitId ?? "all", [unitId]);

  const canOpen = !!unitId;

  return (
    <>
      <Button
        variant="brand"
        onClick={() => {
          if (!canOpen) {
            toast.error("Selecione uma unidade para criar um agendamento.");
            return;
          }
          setOpen(true);
        }}
      >
        Agendar
      </Button>

      <AppointmentForm
        key={formKey} // ✅ força remount quando unitId mudar (zera estado do form)
        mode="admin"
        open={open}
        onOpenChange={setOpen}
        clients={clients}
        appointments={appointments}
        barbers={barbers}
        services={services}
        units={units} // ✅ NOVO
        forcedUnitId={unitId ?? undefined} // ✅ evita null causar inconsistência no form
      >
        {/* IMPORTANTE:
            Passamos um trigger invisível só pra impedir o AppointmentForm
            de renderizar o botão padrão ("Agendar"). */}
        <span className="hidden" aria-hidden="true" />
      </AppointmentForm>
    </>
  );
}
