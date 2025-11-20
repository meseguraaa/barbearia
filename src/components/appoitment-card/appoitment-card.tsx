"use client";

import { cn } from "@/lib/utils";
import { Appointment } from "@/types/appointment";
import { AppointmentForm } from "../appointment-form";
import { Button } from "../ui/button";
import {
  Pen as EditIcon,
  Trash2 as DeleteIcon,
  Loader2 as LoadingingIcon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { AlertDialogTrigger } from "@radix-ui/react-alert-dialog";
import { useState } from "react";
import { deleteAppointment } from "@/app/actions";
import { toast } from "sonner";
import { formatTimeSaoPaulo } from "@/utills/datetime";

type AppointmentCardProps = {
  appointment: Appointment;
  isFirstInSection?: boolean;
  /**
   * Lista de agendamentos (do dia) usada para
   * bloquear horários que encavalem ao editar.
   */
  appointments?: Appointment[];
};

export const AppointmentCard = ({
  appointment,
  isFirstInSection = false,
  appointments = [],
}: AppointmentCardProps) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    const result = await deleteAppointment(appointment.id);

    if (result?.error) {
      toast.error(result.error);
      setIsDeleting(false);
      return;
    }

    toast.success("Agendamento excluído com sucesso");
    setIsDeleting(false);
  };

  return (
    <div
      className={cn(
        "grid grid-cols-2 md:grid-cols-[15%_35%_30%_20%] items-center py-3",
        !isFirstInSection && "border-t border-border-divisor",
      )}
    >
      <div className="text-left pr-4 md:pr-0">
        <span className="text-label-small text-content-primary font-semibold">
          {/* sempre formata no fuso de São Paulo */}
          {formatTimeSaoPaulo(appointment.scheduleAt)}
        </span>
      </div>

      <div className="text-right md:text-left md:pr-4">
        <div className="flex items-center justify-end md:justify-start gap-1">
          <span className=" text-label-small-size text-content-primary font-semibold">
            {appointment.clientName}
          </span>
        </div>
      </div>

      <div className="text-left pr-4 hidden md:block mt-1 md:mt-0 col-span-2 md:col-span-1">
        <span className="text-paragraph-small-size text-content-secondary">
          {appointment.description}
        </span>
      </div>

      <div className="text-right mt-2 md:mt-0 col-span-2 md:col-span-1 flex justify-end items-center gap-2">
        {/* 👉 Agora o formulário recebe todos os agendamentos */}
        <AppointmentForm appointment={appointment} appointments={appointments}>
          <Button variant="edit" size="icon">
            <EditIcon size={16} />
          </Button>
        </AppointmentForm>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="remove" size="icon">
              <DeleteIcon size={16} />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir agendamento</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir este agendamento? Esta ação não
                pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
                {isDeleting && (
                  <LoadingingIcon className="mr-2 h-4 w-4 animate-spin" />
                )}
                Confirmar exclusão
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};
