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
import {
  concludeAppointment,
  cancelAppointment,
} from "@/app/admin/dashboard/actions";
import type { AppointmentStatus } from "@/types/appointment";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type AppointmentActionsProps = {
  appointmentId: string;
  status?: AppointmentStatus | null;

  // dados para exibir no modal de conferência
  clientName: string;
  phone: string;
  description: string;
  scheduleAt: Date;
  barberName?: string | null;

  // valor do serviço (já em número)
  servicePrice?: number | null;
};

export function AppointmentActions({
  appointmentId,
  status,
  clientName,
  phone,
  description,
  scheduleAt,
  barberName,
  servicePrice,
}: AppointmentActionsProps) {
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isDoneStatus = status === "DONE";
  const isCanceledStatus = status === "CANCELED";

  // Pode interagir (conferir/cancelar) se não estiver concluído nem cancelado
  const canInteract = !isDoneStatus && !isCanceledStatus && !isPending;

  const dateStr = format(scheduleAt, "dd/MM/yyyy", { locale: ptBR });
  const timeStr = format(scheduleAt, "HH:mm", { locale: ptBR });

  // formatador de moeda (valor do serviço)
  const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

  function handleConfirmConclude() {
    startTransition(async () => {
      await concludeAppointment(appointmentId);
      setIsReviewOpen(false);
      router.refresh();
    });
  }

  function handleCancel() {
    startTransition(async () => {
      await cancelAppointment(appointmentId);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {/* CONFERIR / CONCLUIR – sempre aparece, mas desabilita em DONE/CANCELED ou durante ação */}
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
              Confirme se as informações abaixo estão corretas.
            </DialogDescription>
          </DialogHeader>

          {/* 🔹 Layout em grade: até 2 colunas em telas maiores */}
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
              <p className="text-label-small text-content-secondary">
                Barbeiro
              </p>
              <p className="text-paragraph-medium text-content-primary">
                {barberName || "—"}
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
            Se alguma informação estiver errada, clique em{" "}
            <span className="font-semibold">Editar</span> na tabela, ajuste os
            dados e depois volte aqui para concluir.
          </p>

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsReviewOpen(false)}
              disabled={isPending}
            >
              Voltar
            </Button>
            <Button
              variant="brand"
              type="button"
              onClick={handleConfirmConclude}
              disabled={!canInteract}
            >
              {isPending ? "Concluindo..." : "Concluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CANCELAR – também sempre aparece, mas desabilita em DONE/CANCELED ou durante ação */}
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
