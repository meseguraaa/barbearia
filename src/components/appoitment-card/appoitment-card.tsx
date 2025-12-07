"use client";

import { cn } from "@/lib/utils";
import { Appointment } from "@/types/appointment";
import { AppointmentForm } from "../appointment-form";
import { Button } from "../ui/button";
import { Pen as EditIcon, Loader2 as LoadingIcon } from "lucide-react";
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
import { AppointmentStatusBadge } from "@/components/appointment-status-badge";

type AppointmentWithLock = Appointment & {
  isLocked?: boolean;
};

type AppointmentCardProps = {
  appointment: AppointmentWithLock;
  isFirstInSection?: boolean;
  appointments?: AppointmentWithLock[];
  barbers: Barber[];
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

    toast.success("Agendamento cancelado com sucesso");
    setIsDeleting(false);
  };

  const isLocked = appointment.isLocked ?? false;

  const showBadge =
    appointment.status === "DONE" || appointment.status === "CANCELED";

  const showActions = !isLocked && appointment.status === "PENDING";

  const barbersForForm = barbers.map((barber) => ({
    id: barber.id,
    name: barber.name ?? "Barbeiro",
    email: barber.email,
    phone: barber.phone ?? "",
    isActive: barber.isActive ?? true,
    role: "BARBER" as const,
  }));

  const barberAny = appointment.barber as any;
  const barberAvatarUrl: string | null =
    barberAny?.user?.image ??
    barberAny?.avatarUrl ??
    barberAny?.imageUrl ??
    barberAny?.image ??
    null;

  const barberInitials =
    appointment.barber?.name
      ?.trim()
      .split(" ")
      .map((n) => n[0]?.toUpperCase())
      .slice(0, 2)
      .join("") || "PB";

  const serviceLabel = appointment.description ?? "";

  return (
    <div
      className={cn(
        "grid grid-cols-2 md:grid-cols-[15%_35%_30%_20%] items-center py-3",
        !isFirstInSection && "border-t border-border-divisor",
      )}
    >
      {/* HORÁRIO */}
      <div className="text-left pr-4 md:pr-0">
        <span className="text-content-primary font-semibold">
          {formatTimeSaoPaulo(appointment.scheduleAt)}
        </span>
      </div>

      {/* PROFISSIONAL + SERVIÇO */}
      <div className="text-right md:text-left md:pr-4">
        <div className="flex items-center justify-end md:justify-start gap-3">
          <div className="h-10 w-10 rounded-full overflow-hidden border border-border-primary bg-background-secondary flex items-center justify-center text-content-primary shrink-0">
            {barberAvatarUrl ? (
              <img
                src={barberAvatarUrl}
                alt={appointment.barber?.name ?? "Profissional"}
                className="h-full w-full object-cover"
              />
            ) : (
              <span>{barberInitials}</span>
            )}
          </div>

          <div className="flex flex-col items-end md:items-start gap-0.5 text-content-primary">
            <span>
              Profissional:{" "}
              <span className="font-semibold">
                {appointment.barber?.name ?? "Profissional"}
              </span>
            </span>

            {serviceLabel && (
              <span className="md:hidden">
                Serviço: <span className="font-semibold">{serviceLabel}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* SERVIÇO (desktop) */}
      <div className="text-left pr-4 hidden md:block col-span-2 md:col-span-1">
        {serviceLabel && (
          <span className="text-content-primary">
            Serviço: <span className="font-semibold">{serviceLabel}</span>
          </span>
        )}
      </div>

      {/* AÇÕES */}
      <div className="text-right col-span-2 md:col-span-1 flex justify-end items-center gap-2">
        {showBadge && <AppointmentStatusBadge status={appointment.status} />}

        {showActions && (
          <>
            {/* EDITAR */}
            <AppointmentForm
              appointment={appointment}
              appointments={appointments}
              barbers={barbersForForm}
              services={services}
            >
              <Button variant="edit" size="icon">
                <EditIcon size={16} />
              </Button>
            </AppointmentForm>

            {/* CANCELAR */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="icon"
                  className="px-9 h-8 flex items-center justify-center"
                >
                  Cancelar
                </Button>
              </AlertDialogTrigger>

              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar agendamento</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tem certeza que deseja cancelar este agendamento? Essa ação
                    não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>
                    Fechar
                  </AlertDialogCancel>

                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting && (
                      <LoadingIcon className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Confirmar cancelamento
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    </div>
  );
};
