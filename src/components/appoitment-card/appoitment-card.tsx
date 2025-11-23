"use client";

import { cn } from "@/lib/utils";
import { Appointment } from "@/types/appointment";
import { AppointmentForm } from "../appointment-form";
import { Button } from "../ui/button";
import {
  Pen as EditIcon,
  Trash2 as DeleteIcon,
  Loader2 as LoadingIcon,
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
  AlertDialogTrigger,
} from "../ui/alert-dialog";
import { useState } from "react";
import { toast } from "sonner";
import { formatTimeSaoPaulo } from "@/utills/datetime";
import { Barber } from "@/types/barber";
import { Service } from "@/types/service";
import { deleteAppointment } from "@/app/admin/dashboard/actions";

type AppointmentCardProps = {
  appointment: Appointment;
  isFirstInSection?: boolean;
  /**
   * Lista de agendamentos (do dia) usada para
   * bloquear horários que encavalem ao editar.
   */
  appointments?: Appointment[];
  /**
   * Lista de barbeiros ativos (para o select de edição)
   */
  barbers: Barber[];
  /**
   * Lista de serviços ativos (para o select de edição)
   */
  services: Service[];
};

export const AppointmentCard = ({
  appointment,
  isFirstInSection = false,
  appointments = [],
  barbers,
  services,
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
      {/* HORÁRIO */}
      <div className="text-left pr-4 md:pr-0">
        <span className="text-label-small text-content-primary font-semibold">
          {formatTimeSaoPaulo(appointment.scheduleAt)}
        </span>
      </div>

      {/* CLIENTE + BARBEIRO */}
      <div className="text-right md:text-left md:pr-4">
        <div className="flex flex-col items-end md:items-start gap-1">
          <span className=" text-label-small-size text-content-primary font-semibold">
            {appointment.clientName}
          </span>
          {appointment.barber?.name && (
            <span className="text-paragraph-small-size text-content-secondary">
              {appointment.barber.name}
            </span>
          )}
        </div>
      </div>

      {/* DESCRIÇÃO */}
      <div className="text-left pr-4 hidden md:block mt-1 md:mt-0 col-span-2 md:col-span-1">
        <span className="text-paragraph-small-size text-content-secondary">
          {appointment.description}
        </span>
      </div>

      {/* AÇÕES */}
      <div className="text-right mt-2 md:mt-0 col-span-2 md:col-span-1 flex justify-end items-center gap-2">
        {/* EDITAR */}
        <AppointmentForm
          appointment={appointment}
          appointments={appointments}
          barbers={barbers}
          services={services}
        >
          <Button variant="edit" size="icon">
            <EditIcon size={16} />
          </Button>
        </AppointmentForm>

        {/* EXCLUIR – APENAS NA TELA DO USUÁRIO */}
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
              <AlertDialogCancel disabled={isDeleting}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
                {isDeleting && (
                  <LoadingIcon className="mr-2 h-4 w-4 animate-spin" />
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
