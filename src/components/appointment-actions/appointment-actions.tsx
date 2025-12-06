"use client";

import { useMemo, useState, useTransition } from "react";
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

type RoleForAction = "ADMIN" | "BARBER";

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

  // configuração da taxa de cancelamento vinda do serviço
  cancelFeePercentage?: number | null;
  cancelLimitHours?: number | null;

  // quem está agindo (para log)
  cancelledByRole?: RoleForAction;
  concludedByRole?: RoleForAction;

  // 🔹 infos de plano (opcionais)
  // se for um atendimento usando crédito de plano
  isPlanCredit?: boolean;
  // índice do crédito deste atendimento (1 = primeiro, 2 = segundo, etc.)
  planCreditIndex?: number | null;
  // total de créditos do plano (ex.: 4)
  planTotalCredits?: number | null;
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
  cancelFeePercentage,
  cancelLimitHours,
  cancelledByRole,
  concludedByRole,
  isPlanCredit,
  planCreditIndex,
  planTotalCredits,
}: AppointmentActionsProps) {
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
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

  // 🔹 Derivados de plano (para saber se mostra valor e contagem de créditos)
  const {
    isPlanCreditEffective,
    isFirstPlanCredit,
    shouldShowServicePriceInReview,
    planCreditsLabel,
  } = useMemo(() => {
    const hasPlanInfo =
      !!planTotalCredits && !!planCreditIndex && planCreditIndex > 0;

    const isPlanCreditEffective = !!isPlanCredit && hasPlanInfo;
    const isFirstPlanCredit =
      isPlanCreditEffective && planCreditIndex === 1 && !!servicePrice;

    // Regra:
    // - se NÃO é atendimento de plano → mostra valor se existir (comportamento antigo)
    // - se É atendimento de plano → mostra valor apenas no 1º crédito
    const shouldShowServicePriceInReview = !isPlanCreditEffective
      ? servicePrice != null
      : isFirstPlanCredit;

    const planCreditsLabel =
      isPlanCreditEffective && planTotalCredits && planCreditIndex
        ? `${planCreditIndex} de ${planTotalCredits}`
        : null;

    return {
      isPlanCreditEffective,
      isFirstPlanCredit,
      shouldShowServicePriceInReview,
      planCreditsLabel,
    };
  }, [isPlanCredit, planCreditIndex, planTotalCredits, servicePrice]);

  // cálculo se ESTÁ dentro da janela onde pode cobrar taxa
  const { isInsideFeeWindow, estimatedFeeValue } = useMemo(() => {
    if (
      !servicePrice ||
      !cancelLimitHours ||
      cancelLimitHours <= 0 ||
      !cancelFeePercentage ||
      cancelFeePercentage <= 0
    ) {
      return {
        isInsideFeeWindow: false,
        estimatedFeeValue: 0,
      };
    }

    const now = new Date().getTime();
    const scheduleTime = new Date(scheduleAt).getTime();
    const diffMs = scheduleTime - now;
    const diffHours = diffMs / (1000 * 60 * 60); // horas para o horário agendado

    const isInside = diffHours < cancelLimitHours;

    const fee = (servicePrice * cancelFeePercentage) / 100;

    return {
      isInsideFeeWindow: isInside,
      estimatedFeeValue: fee,
    };
  }, [servicePrice, cancelLimitHours, cancelFeePercentage, scheduleAt]);

  /* ---------------------------
   * CONCLUIR
   * --------------------------- */
  function handleConfirmConclude() {
    startTransition(async () => {
      await concludeAppointment(appointmentId, {
        concludedByRole,
      });
      setIsReviewOpen(false);
      router.refresh();
    });
  }

  /* ---------------------------
   * CANCELAR SEM / COM TAXA
   * --------------------------- */
  function handleOpenCancelDialog() {
    setIsCancelDialogOpen(true);
  }

  function runCancel(applyFee: boolean) {
    startTransition(async () => {
      await cancelAppointment(appointmentId, {
        applyFee,
        cancelledByRole,
      });
      setIsCancelDialogOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {/* CONFERIR / CONCLUIR */}
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

            {/* VALOR DO SERVIÇO / PLANO  */}
            <div>
              <p className="text-label-small text-content-secondary">
                Valor do serviço
              </p>
              <p className="text-paragraph-medium text-content-primary">
                {shouldShowServicePriceInReview && servicePrice != null
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

            {/* 🔹 Créditos do plano (se for atendimento de plano) */}
            {planCreditsLabel && (
              <div className="md:col-span-2">
                <p className="text-label-small text-content-secondary">
                  Créditos do plano
                </p>
                <p className="text-paragraph-medium text-content-primary">
                  {planCreditsLabel}
                </p>
              </div>
            )}
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

      {/* CANCELAR – abre modal próprio de cancelamento */}
      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogTrigger asChild>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleOpenCancelDialog}
            disabled={!canInteract}
          >
            Cancelar
          </Button>
        </DialogTrigger>

        <DialogContent
          variant="appointment"
          overlayVariant="blurred"
          showCloseButton
        >
          <DialogHeader>
            <DialogTitle size="modal">Cancelar agendamento</DialogTitle>
            <DialogDescription size="modal">
              Confirme o cancelamento deste horário.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-2">
            <p className="text-paragraph-medium text-content-primary">
              {clientName} — {description}
            </p>
            <p className="text-paragraph-small text-content-secondary">
              Horário:{" "}
              <span className="font-semibold">
                {dateStr} às {timeStr}
              </span>
            </p>

            {servicePrice != null && (
              <p className="text-paragraph-small text-content-secondary">
                Valor do serviço:{" "}
                <span className="font-semibold">
                  {currencyFormatter.format(servicePrice)}
                </span>
              </p>
            )}

            {isInsideFeeWindow && estimatedFeeValue > 0 ? (
              <div className="mt-3 space-y-1">
                <p className="text-paragraph-small text-content-secondary">
                  Este cancelamento está{" "}
                  <span className="font-semibold">dentro do prazo</span> para
                  cobrança de taxa.
                </p>
                <p className="text-paragraph-small text-content-secondary">
                  Taxa configurada:{" "}
                  <span className="font-semibold">
                    {cancelFeePercentage?.toFixed(2)}%
                  </span>{" "}
                  ({currencyFormatter.format(estimatedFeeValue)}).
                </p>
                <p className="text-paragraph-small text-content-secondary">
                  Deseja aplicar a taxa de cancelamento?
                </p>
              </div>
            ) : (
              <p className="text-paragraph-small text-content-secondary mt-3">
                Este cancelamento não está dentro da janela configurada para
                cobrança de taxa, ou o serviço não possui taxa configurada.
              </p>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsCancelDialogOpen(false)}
              disabled={isPending}
            >
              Voltar
            </Button>

            {/* Cancelar SEM taxa */}
            <Button
              type="button"
              variant="outline"
              onClick={() => runCancel(false)}
              disabled={isPending}
            >
              {isPending ? "Cancelando..." : "Cancelar sem taxa"}
            </Button>

            {/* Cancelar COM taxa (só faz sentido se estiver na janela) */}
            {isInsideFeeWindow && estimatedFeeValue > 0 && (
              <Button
                type="button"
                variant="brand"
                onClick={() => runCancel(true)}
                disabled={isPending}
              >
                {isPending ? "Aplicando taxa..." : "Cancelar com taxa"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
