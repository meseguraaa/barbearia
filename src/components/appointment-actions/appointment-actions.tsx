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
import { toast } from "sonner";

type RoleForAction = "ADMIN" | "BARBER";

type AppointmentActionsProps = {
  appointmentId: string;
  status?: AppointmentStatus | null;

  clientName: string;
  phone: string;
  description: string;
  scheduleAt: Date;
  barberName?: string | null;

  servicePrice?: number | null;

  cancelFeePercentage?: number | null;
  cancelLimitHours?: number | null;

  cancelledByRole?: RoleForAction;
  concludedByRole?: RoleForAction;

  isPlanCredit?: boolean;
  planCreditIndex?: number | null;
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

  const canInteract = !isDoneStatus && !isCanceledStatus && !isPending;

  const dateStr = format(scheduleAt, "dd/MM/yyyy", { locale: ptBR });
  const timeStr = format(scheduleAt, "HH:mm", { locale: ptBR });

  const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

  const { shouldShowServicePriceInReview, planCreditsLabel } = useMemo(() => {
    const hasPlanInfo =
      !!planTotalCredits && !!planCreditIndex && planCreditIndex > 0;

    const isPlanCreditEffective = !!isPlanCredit && hasPlanInfo;
    const isFirstPlanCredit =
      isPlanCreditEffective && planCreditIndex === 1 && !!servicePrice;

    const shouldShowServicePriceInReview = !isPlanCreditEffective
      ? servicePrice != null
      : isFirstPlanCredit;

    const planCreditsLabel =
      isPlanCreditEffective && planTotalCredits && planCreditIndex
        ? `${planCreditIndex} de ${planTotalCredits}`
        : null;

    return {
      shouldShowServicePriceInReview,
      planCreditsLabel,
    };
  }, [isPlanCredit, planCreditIndex, planTotalCredits, servicePrice]);

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
    const diffHours = diffMs / (1000 * 60 * 60);

    const isInside = diffHours < cancelLimitHours;
    const fee = (servicePrice * cancelFeePercentage) / 100;

    return {
      isInsideFeeWindow: isInside,
      estimatedFeeValue: fee,
    };
  }, [servicePrice, cancelLimitHours, cancelFeePercentage, scheduleAt]);

  function handleConfirmConclude(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();

    if (!canInteract) return;

    // ✅ se não vier, no admin normalmente é ADMIN mesmo
    const roleToUse: RoleForAction =
      concludedByRole ?? ("ADMIN" as RoleForAction);

    console.log("[UI] Concluir click", { appointmentId, roleToUse });

    startTransition(async () => {
      const result = await concludeAppointment(appointmentId, {
        concludedByRole: roleToUse,
      });

      console.log("[UI] concludeAppointment result:", result);

      setIsReviewOpen(false);

      if (result && typeof result === "object" && "error" in result) {
        toast.error((result as any).error ?? "Erro ao concluir");
        router.refresh();
        return;
      }

      toast.success("Atendimento concluído!");

      // ✅ ADMIN sempre vai pro checkout (não depende de orderId)
      if (roleToUse === "ADMIN") {
        router.push("/admin/checkout");
        return;
      }

      router.refresh();
    });
  }

  function handleOpenCancelDialog(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (!canInteract) return;
    setIsCancelDialogOpen(true);
  }

  function runCancel(applyFee: boolean, e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();

    if (!canInteract) return;

    const roleToUse: RoleForAction =
      cancelledByRole ?? ("ADMIN" as RoleForAction);

    console.log("[UI] Cancelar click", { appointmentId, applyFee, roleToUse });

    startTransition(async () => {
      const result = await cancelAppointment(appointmentId, {
        applyFee,
        cancelledByRole: roleToUse,
      });

      console.log("[UI] cancelAppointment result:", result);

      setIsCancelDialogOpen(false);

      if (result && typeof result === "object" && "error" in result) {
        toast.error((result as any).error ?? "Erro ao cancelar");
      } else {
        toast.success("Agendamento cancelado!");
      }

      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {/* CONFERIR / CONCLUIR */}
      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white"
            disabled={!canInteract}
            onClick={(e) => {
              // ✅ impede submit/reload fantasma
              e.preventDefault();
              e.stopPropagation();
              setIsReviewOpen(true);
            }}
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

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsReviewOpen(false);
              }}
              disabled={isPending}
            >
              Voltar
            </Button>
            <Button
              type="button"
              variant="brand"
              onClick={handleConfirmConclude}
              disabled={!canInteract}
            >
              {isPending ? "Concluindo..." : "Concluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CANCELAR */}
      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
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
              type="button"
              variant="outline"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsCancelDialogOpen(false);
              }}
              disabled={isPending}
            >
              Voltar
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={(e) => runCancel(false, e)}
              disabled={isPending}
            >
              {isPending ? "Cancelando..." : "Cancelar sem taxa"}
            </Button>

            {isInsideFeeWindow && estimatedFeeValue > 0 && (
              <Button
                type="button"
                variant="brand"
                onClick={(e) => runCancel(true, e)}
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
