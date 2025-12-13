// src/components/admin-new-appointment-button/admin-new-appointment-button.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AppointmentForm } from "@/components/appointment-form";
import type { AppointmentClientOption } from "@/components/appointment-form";
import type { Appointment } from "@/types/appointment";
import type { Service } from "@/types/service";

type Props = {
  clients: AppointmentClientOption[];
  appointments: Appointment[];
  barbers: any[];
  services: Service[];
};

export function AdminNewAppointmentButton({
  clients,
  appointments,
  barbers,
  services,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="brand" onClick={() => setOpen(true)}>
        Agendar
      </Button>

      <AppointmentForm
        mode="admin"
        open={open}
        onOpenChange={setOpen}
        clients={clients}
        appointments={appointments}
        barbers={barbers}
        services={services}
      >
        {/* IMPORTANTE:
            Passamos um trigger invisível só pra impedir o AppointmentForm
            de renderizar o botão padrão ("Agendar"). */}
        <span className="hidden" aria-hidden="true" />
      </AppointmentForm>
    </>
  );
}
