"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { markAppointmentDone, cancelAppointment } from "@/app/barber/actions";
import type { AppointmentStatus } from "@/types/appointment";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type BarberAppointmentActionsProps = {
  appointmentId: string;
  status?: AppointmentStatus | null;

  clientName: string;
  phone: string;
  description: string;
  scheduleAt: Date;

  // valor do serviço já em número
  servicePrice?: number | null;
};

export function BarberAppointmentActions({
  appointmentId,
  status,
  clientName,
  phone,
  description,
  scheduleAt,
  servicePrice,
}: BarberAppointmentActionsProps) {
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isPendingTransition, startTransition] = useTransition();
  const router = useRouter();

  const dateStr = format(scheduleAt, "dd/MM/yyyy", { locale: ptBR });
  const timeStr = format(scheduleAt, "HH:mm", { locale: ptBR });

  const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

  // ================== REGRAS DE STATUS ==================

  // Se por algum motivo vier null/undefined, trato como PENDING
  const effectiveStatus: AppointmentStatus =
    (status as AppointmentStatus) ?? "PENDING";

  const isPendingStatus = effectiveStatus === "PENDING";

  // Só mostra os botões enquanto estiver PENDENTE
  if (!isPendingStatus) {
    return null;
  }

  const canInteract = !isPendingTransition;

  // ======================================================

  function handleConfirmConclude() {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("appointmentId", appointmentId);
      await markAppointmentDone(fd);
      setIsReviewOpen(false);
      router.refresh();
    });
  }

  function handleCancel() {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("appointmentId", appointmentId);
      await cancelAppointment(fd);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {/* CONFERIR / CONCLUIR – só enquanto estiver PENDENTE */}
      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogTrigger asChild>
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white"
            disabled={!canInteract}
          >
            Conferir
          </Button>
        </DialogTrigger>

        <DialogContent
          variant="appointment"
          overlayVariant="blurred"
          showCloseButton
        >
          <DialogHeader>
            <DialogTitle size="modal">Conferência</DialogTitle>
            <DialogDescription size="modal">
              Confirme se as informações abaixo estão corretas antes de concluir
              o atendimento.
            </DialogDescription>
          </DialogHeader>

          {/* 🔹 Grade 2 colunas no desktop */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div>
              <p className="text-label-small text-content-secondary">Cliente</p>
              <p className="text-paragraph-medium text-content-primary">
                {clientName}
              </p>
            </div>

            <div>
              <p className="text-label-small text-content-secondary">
                Telefone
              </p>
              <p className="text-paragraph-medium text-content-primary">
                {phone || "—"}
              </p>
            </div>

            <div>
              <p className="text-label-small text-content-secondary">Serviço</p>
              <p className="text-paragraph-medium text-content-primary">
                {description}
              </p>
            </div>

            <div>
              <p className="text-label-small text-content-secondary">
                Valor do serviço
              </p>
              <p className="text-paragraph-medium text-content-primary">
                {servicePrice != null
                  ? currencyFormatter.format(servicePrice)
                  : "—"}
              </p>
            </div>

            <div>
              <p className="text-label-small text-content-secondary">Data</p>
              <p className="text-paragraph-medium text-content-primary">
                {dateStr}
              </p>
            </div>

            <div>
              <p className="text-label-small text-content-secondary">Horário</p>
              <p className="text-paragraph-medium text-content-primary">
                {timeStr}
              </p>
            </div>
          </div>

          <p className="text-paragraph-small text-content-secondary mt-3">
            Se algo estiver errado, avise o administrador antes de concluir este
            atendimento.
          </p>

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsReviewOpen(false)}
              disabled={isPendingTransition}
            >
              Voltar
            </Button>
            <Button
              variant="brand"
              type="button"
              onClick={handleConfirmConclude}
              disabled={!canInteract}
            >
              {isPendingTransition ? "Concluindo..." : "Concluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CANCELAR – também só enquanto estiver PENDENTE */}
      <Button
        size="sm"
        variant="destructive"
        onClick={handleCancel}
        disabled={!canInteract}
      >
        Cancelar
      </Button>
    </div>
  );
}
