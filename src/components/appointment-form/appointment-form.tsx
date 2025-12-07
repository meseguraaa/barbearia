"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarIcon,
  ChevronDownIcon,
  Clock,
  Loader2,
  Phone,
  Scissors,
  User,
  UserCircle,
} from "lucide-react";
import { IMaskInput } from "react-imask";
import { addMinutes, format, isSameDay, startOfToday } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { cn } from "@/lib/utils";
import { Calendar } from "../ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { toast } from "sonner";
import {
  createAppointment,
  updateAppointment,
  getAvailabilityWindowsForBarberOnDateAction,
  getAvailableBarbersForDateAction,
} from "@/app/admin/dashboard/actions";
import { ReactNode, useEffect, useState } from "react";
import { Appointment } from "@/types/appointment";
import {
  appointmentFormSchema,
  AppointFormValues,
} from "@/components/appointment-form/schema";
import { Service } from "@/types/service";
import { useSession } from "next-auth/react";

// mesmo formato do util
type AvailabilityWindow = {
  startTime: string;
  endTime: string;
};

// Tipo normalizado de profissional só para o formulário
// Agora pode carregar também os serviços que ele realiza
type AppointmentBarber = {
  id: string;
  name: string; // sempre string pra exibir direitinho
  email: string;
  phone: string;
  isActive: boolean;
  role: "BARBER";
  serviceIds?: string[]; // IDs de serviços que este profissional realiza
};

// 🔹 Resumo do plano do cliente para o formulário
type ClientPlanSummary = {
  planId: string;
  planName: string;
  status: "ACTIVE" | "EXPIRED" | "CANCELED";
  usedBookings: number;
  totalBookings: number;
  endDate: string | Date;
  serviceIds: string[]; // serviços cobertos pelo plano
};

/* ------------------------------------------------------------------
 * Helpers para cálculo de horários disponíveis no front
 * ------------------------------------------------------------------ */

function parseTimeToDate(baseDate: Date, time: string): Date {
  const [hoursStr, minutesStr] = time.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);

  const d = new Date(baseDate);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function intervalsOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean {
  return startA < endB && endA > startB;
}

type BuildAvailableTimesArgs = {
  availabilityWindows?: AvailabilityWindow[];
  selectedDate: Date;
  selectedBarberId: string;
  serviceDurationMinutes: number;
  appointments: Appointment[];
  currentAppointmentId?: string;
  servicesList: Service[];
  slotIntervalMinutes?: number;
};

function buildAvailableTimes({
  availabilityWindows,
  selectedDate,
  selectedBarberId,
  serviceDurationMinutes,
  appointments,
  currentAppointmentId,
  servicesList,
  slotIntervalMinutes = 30,
}: BuildAvailableTimesArgs): string[] {
  if (!availabilityWindows || availabilityWindows.length === 0) {
    return [];
  }

  // Filtra agendamentos do profissional, no mesmo dia, e ignora CANCELADO
  const dayAppointments = appointments.filter((appt) => {
    if (!appt.barberId || appt.barberId !== selectedBarberId) return false;

    const apptDate = new Date(appt.scheduleAt);
    if (!isSameDay(apptDate, selectedDate)) return false;

    if ((appt as any).status === "CANCELED") return false;

    if (currentAppointmentId && appt.id === currentAppointmentId) {
      return false;
    }

    return true;
  });

  const busyIntervals = dayAppointments
    .map((appt) => {
      const start = new Date(appt.scheduleAt);

      const matchedServiceById = appt.serviceId
        ? servicesList.find((s) => s.id === appt.serviceId)
        : undefined;

      const matchedServiceByName = servicesList.find(
        (s) => s.name === appt.description,
      );

      const finalService = matchedServiceById ?? matchedServiceByName;
      const duration =
        finalService?.durationMinutes != null
          ? finalService.durationMinutes
          : 30;

      const end = addMinutes(start, duration);

      return { start, end };
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const availableSlots: string[] = [];

  for (const window of availabilityWindows) {
    const windowStart = parseTimeToDate(selectedDate, window.startTime);
    const windowEnd = parseTimeToDate(selectedDate, window.endTime);

    let slotStart = new Date(windowStart);

    while (
      addMinutes(slotStart, serviceDurationMinutes).getTime() <=
      windowEnd.getTime()
    ) {
      const slotEnd = addMinutes(slotStart, serviceDurationMinutes);

      const hasConflict = busyIntervals.some((busy) =>
        intervalsOverlap(slotStart, slotEnd, busy.start, busy.end),
      );

      if (!hasConflict) {
        const hours = String(slotStart.getHours()).padStart(2, "0");
        const minutes = String(slotStart.getMinutes()).padStart(2, "0");
        availableSlots.push(`${hours}:${minutes}`);
      }

      slotStart = addMinutes(slotStart, slotIntervalMinutes);
    }
  }

  return availableSlots;
}

// 🔹 helper para garantir lista SEMPRE em ordem alfabética
function sortProfessionals(list: AppointmentBarber[]): AppointmentBarber[] {
  return [...list].sort((a, b) =>
    (a.name ?? "").localeCompare(b.name ?? "", "pt-BR", {
      sensitivity: "base",
    }),
  );
}

// 🔹 filtra profissionais que executam o serviço selecionado
function filterProfessionalsByService(
  list: AppointmentBarber[],
  selectedServiceId: string | undefined,
): AppointmentBarber[] {
  if (!selectedServiceId) {
    return sortProfessionals(list);
  }

  return sortProfessionals(
    list.filter((barber) => {
      // backward-compatible: se não vier serviceIds, não filtra
      if (!barber.serviceIds || barber.serviceIds.length === 0) {
        return true;
      }
      return barber.serviceIds.includes(selectedServiceId);
    }),
  );
}

type AppointmentFormProps = {
  appointment?: Appointment;
  appointments?: Appointment[];
  /**
   * Lista de profissionais ativos já normalizados.
   * Idealmente incluindo serviceIds (serviços que cada profissional executa).
   */
  barbers: AppointmentBarber[];
  services?: Service[];
  children?: ReactNode;
  defaultClientName?: string;
  clientPlan?: ClientPlanSummary | null;
};

export const AppointmentForm = ({
  appointment,
  appointments = [],
  barbers,
  services,
  children,
  defaultClientName,
  clientPlan,
}: AppointmentFormProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const isEdit = !!appointment?.id;
  const servicesList = services ?? [];

  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const sessionClientName =
    role === "CLIENT" ? ((session?.user as any)?.name ?? "") : "";
  const sessionPhone =
    role === "CLIENT" ? ((session?.user as any)?.phone ?? "") : "";

  const initialClientName = defaultClientName ?? sessionClientName ?? "";

  const form = useForm<AppointFormValues>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: {
      clientName: initialClientName,
      phone: sessionPhone || "",
      serviceId: "",
      description: "",
      scheduleAt: undefined,
      time: "",
      barberId: "",
    },
  });

  const onSubmit = async (data: AppointFormValues) => {
    const [hour, minute] = data.time.split(":");
    const scheduleAt = new Date(data.scheduleAt);
    scheduleAt.setHours(Number(hour), Number(minute), 0, 0);

    const payload = {
      clientName: data.clientName,
      phone: data.phone,
      description: data.description,
      scheduleAt,
      barberId: data.barberId,
      serviceId: data.serviceId,
    };

    const result = isEdit
      ? await updateAppointment(appointment!.id, payload)
      : await createAppointment(payload);

    if (result?.error) {
      toast.error(result.error);
      return;
    }

    toast.success(
      `Agendamento ${isEdit ? "atualizado" : "criado"} com sucesso!`,
    );

    setIsOpen(false);
    form.reset({
      clientName: initialClientName,
      phone: sessionPhone || "",
      serviceId: "",
      description: "",
      scheduleAt: undefined,
      time: "",
      barberId: "",
    });
  };

  const handleSubmit = form.handleSubmit(onSubmit, (errors) => {
    const firstError = Object.values(errors)[0];

    if (!firstError) return;

    const message = firstError?.message;

    if (message) {
      toast.error(String(message));
    } else {
      toast.error("Verifique os campos obrigatórios.");
    }
  });

  useEffect(() => {
    if (!appointment) {
      form.reset({
        clientName: initialClientName,
        phone: sessionPhone || "",
        serviceId: "",
        description: "",
        scheduleAt: undefined,
        time: "",
        barberId: "",
      });
      return;
    }

    const date = new Date(appointment.scheduleAt);
    const time = format(date, "HH:mm");

    const matchedServiceById = appointment.serviceId
      ? servicesList.find((service) => service.id === appointment.serviceId)
      : undefined;

    const matchedServiceByName = servicesList.find(
      (service) => service.name === appointment.description,
    );

    const finalService = matchedServiceById ?? matchedServiceByName;

    form.reset({
      clientName: appointment.clientName,
      phone: appointment.phone,
      serviceId: finalService?.id ?? appointment.serviceId ?? "",
      description: appointment.description ?? finalService?.name ?? "",
      scheduleAt: date,
      time,
      barberId: appointment.barberId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment, servicesList.length, initialClientName, sessionPhone]);

  useEffect(() => {
    if (appointment?.id) {
      console.log("AppointmentForm ▶ render para agendamento", {
        id: appointment.id,
        clientName: appointment.clientName,
      });
    }
  }, [appointment?.id, appointment?.clientName]);

  const selectedServiceId = form.watch("serviceId");
  const selectedDate = form.watch("scheduleAt");
  const selectedTime = form.watch("time");
  const selectedBarberId = form.watch("barberId");

  const selectedServiceData = servicesList.find(
    (service) => service.id === selectedServiceId,
  );

  const hasActivePlan =
    !!clientPlan &&
    clientPlan.status === "ACTIVE" &&
    clientPlan.usedBookings < clientPlan.totalBookings;

  const isServiceCoveredByPlan =
    hasActivePlan &&
    !!selectedServiceId &&
    !!clientPlan?.serviceIds?.includes(selectedServiceId);

  const normalizedEndDate =
    clientPlan && clientPlan.endDate ? new Date(clientPlan.endDate) : null;

  // ===== profissionais disponíveis para a data (sem filtro de serviço ainda) =====
  const [availableBarbersForDate, setAvailableBarbersForDate] = useState<
    AppointmentBarber[]
  >(() => sortProfessionals(barbers));
  const [isLoadingBarbers, setIsLoadingBarbers] = useState(false);

  useEffect(() => {
    if (!selectedDate) {
      setAvailableBarbersForDate(sortProfessionals(barbers));
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setIsLoadingBarbers(true);
        const isoDate = selectedDate.toISOString();

        let result = (await getAvailableBarbersForDateAction(
          isoDate,
        )) as AppointmentBarber[];

        result = Array.isArray(result) ? result : [];

        // Garantir que o barbeiro do agendamento em edição apareça,
        // mesmo que não esteja na lista de disponibilidade retornada
        if (isEdit && appointment?.barberId) {
          const existsInResult = result.some(
            (b) => b.id === appointment.barberId,
          );
          if (!existsInResult) {
            const apptBarber = barbers.find(
              (b) => b.id === appointment.barberId,
            );
            if (apptBarber) {
              result = [...result, apptBarber];
            }
          }
        }

        if (!cancelled) {
          setAvailableBarbersForDate(sortProfessionals(result));
        }
      } catch (error) {
        console.error(
          "AppointmentForm ▶ erro ao buscar profissionais disponíveis na data",
          error,
        );
        if (!cancelled) {
          setAvailableBarbersForDate(sortProfessionals(barbers));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingBarbers(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedDate, barbers, isEdit, appointment?.barberId]);

  // Lista final de profissionais exibidos: disponíveis NA DATA + que fazem o SERVIÇO
  const filteredBarbers = filterProfessionalsByService(
    availableBarbersForDate,
    selectedServiceId,
  );

  // ===== janelas de disponibilidade do profissional =====
  const [availabilityWindows, setAvailabilityWindows] = useState<
    AvailabilityWindow[] | undefined
  >(undefined);

  useEffect(() => {
    if (!selectedDate || !selectedBarberId) {
      setAvailabilityWindows(undefined);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const iso = selectedDate.toISOString();
        const windows = await getAvailabilityWindowsForBarberOnDateAction(
          selectedBarberId,
          iso,
        );

        if (!cancelled) {
          if (!windows) {
            setAvailabilityWindows(undefined);
          } else {
            setAvailabilityWindows(windows as AvailabilityWindow[]);
          }
        }
      } catch (error) {
        console.error(
          "AppointmentForm ▶ erro ao buscar disponibilidade do profissional",
          error,
        );
        if (!cancelled) {
          setAvailabilityWindows(undefined);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedDate, selectedBarberId]);

  // ===== horários disponíveis =====
  let availableTimes: string[] = [];

  try {
    if (
      selectedServiceId &&
      selectedDate &&
      selectedBarberId &&
      selectedServiceData
    ) {
      availableTimes = buildAvailableTimes({
        availabilityWindows,
        selectedDate,
        selectedBarberId,
        serviceDurationMinutes: selectedServiceData.durationMinutes,
        appointments,
        currentAppointmentId: appointment?.id,
        servicesList,
        slotIntervalMinutes: 30,
      });
    } else {
      availableTimes = [];
    }
  } catch (error) {
    console.error("AppointmentForm ▶ erro ao calcular horários disponíveis", {
      error,
      hasAppointments: appointments?.length,
      currentAppointmentId: appointment?.id,
    });
    availableTimes = [];
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant={isEdit ? "edit2" : "brand"} size="sm">
          {isEdit ? "Editar" : "Agendar"}
        </Button>
      </DialogTrigger>

      <DialogContent
        variant="appointment"
        overlayVariant="blurred"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle size="modal">
            {isEdit ? "Editar agendamento" : "Agende um atendimento"}
          </DialogTitle>
          <DialogDescription size="modal">
            {isEdit
              ? "Atualize os dados deste atendimento:"
              : "Preencha os dados do cliente para realizar o agendamento:"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* SEU NOME */}
            <FormField
              control={form.control}
              name="clientName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-label-medium-size text-content-primary">
                    Seu nome
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <User
                        className="absolute left-3 top-1/2 -translate-y-1/2 transform text-content-brand"
                        size={20}
                      />
                      <Input
                        placeholder="Seu nome"
                        className="pl-10"
                        {...field}
                      />
                    </div>
                  </FormControl>
                </FormItem>
              )}
            />

            {/* TELEFONE */}
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-label-medium-size text-content-primary">
                    Telefone
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Phone
                        className="absolute left-3 top-1/2 -translate-y-1/2 transform text-content-brand"
                        size={20}
                      />
                      <IMaskInput
                        placeholder="(99) 99999-9999"
                        mask="(00) 00000-0000"
                        className="pl-10 flex h-12 w-full rounded-md border border-border-primary bg-background-tertiary px-3 py-2 text-sm text-content-primary ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-content-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-0 focus-visible:ring-border-brand disabled:cursor-not-allowed disabled:opacity-50 hover:border-border-secondary focus:border-border-brand focus-visible:border-border-brand aria-invalid:ring-destructive/20 aria-invalid:border-destructive"
                        {...field}
                      />
                    </div>
                  </FormControl>
                </FormItem>
              )}
            />

            {/* SERVIÇO */}
            <FormField
              control={form.control}
              name="serviceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-label-medium-size text-content-primary">
                    Serviço
                  </FormLabel>
                  <FormControl>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);

                        const service = servicesList.find(
                          (s) => s.id === value,
                        );

                        form.setValue("description", service?.name ?? "");
                        form.setValue("scheduleAt", undefined as any);
                        form.setValue("time", "");
                        form.setValue("barberId", "");
                      }}
                      value={field.value}
                    >
                      <SelectTrigger>
                        <div className="flex items-center gap-2">
                          <Scissors className="h-4 w-4 text-content-brand" />
                          <SelectValue placeholder="Selecione o serviço" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {servicesList.length === 0 ? (
                          <SelectItem disabled value="no-services">
                            Nenhum serviço disponível
                          </SelectItem>
                        ) : (
                          servicesList.map((service) => (
                            <SelectItem key={service.id} value={service.id}>
                              {service.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </FormControl>

                  {selectedServiceData && (
                    <div className="mt-0.5 text-paragraph-small-size text-content-secondary">
                      {hasActivePlan && isServiceCoveredByPlan ? (
                        <>
                          <span className="font-bold">
                            {clientPlan!.planName} - {clientPlan!.usedBookings}{" "}
                            /{" "}
                          </span>
                          {clientPlan!.totalBookings} agendamentos usados
                          <span className="block text-xs mt-0.5">
                            Este atendimento usará <b>1 crédito</b> do seu
                            plano.
                          </span>
                          {selectedServiceData?.durationMinutes != null && (
                            <span className="block text-xs mt-0.5">
                              Duração do serviço:{" "}
                              <span className="font-semibold">
                                {selectedServiceData.durationMinutes} minutos
                              </span>
                            </span>
                          )}
                          {normalizedEndDate && (
                            <span className="block text-xs mt-0.5">
                              Validade até{" "}
                              <span className="font-semibold">
                                {normalizedEndDate.toLocaleDateString("pt-BR")}
                              </span>
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          Valor:{" "}
                          <span className="font-semibold">
                            R$ {selectedServiceData.price.toFixed(2)}
                          </span>{" "}
                          • Duração:{" "}
                          <span className="font-semibold">
                            {selectedServiceData.durationMinutes} minutos
                          </span>
                          {hasActivePlan && !isServiceCoveredByPlan && (
                            <span className="block text-xs mt-1">
                              Este serviço não está incluído no seu plano e será
                              cobrado normalmente.
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </FormItem>
              )}
            />

            {/* DATA */}
            <FormField
              control={form.control}
              name="scheduleAt"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className="text-label-medium-size text-content-primary">
                    Data
                  </FormLabel>
                  <Popover
                    open={isDatePickerOpen}
                    onOpenChange={setIsDatePickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          disabled={!selectedServiceId}
                          className={cn(
                            "w-full justify-between text-left font-normal bg-background-tertiary border-border-primary text-content-primary hover:bg-background-tertiary hover:border-border-secondary hover:text-content-primary focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand focus:border-border-brand focus-visible:border-border-brand disabled:opacity-60 disabled:cursor-not-allowed",
                            !field.value && "text-content-secondary",
                          )}
                          onClick={() => {
                            if (!selectedServiceId) return;
                            setIsDatePickerOpen(true);
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <CalendarIcon
                              className=" text-content-brand"
                              size={20}
                            />
                            {field.value ? (
                              format(field.value, "dd/MM/yyyy")
                            ) : (
                              <span>
                                {!selectedServiceId
                                  ? "Selecione um serviço"
                                  : "Selecione uma data"}
                              </span>
                            )}
                          </div>
                          <ChevronDownIcon className="opacity-50 h-4 w-4" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={(date) => {
                          field.onChange(date ?? undefined);
                          form.setValue("time", "");
                          form.setValue("barberId", "");

                          // 👇 SÓ FECHA QUANDO UM DIA É SELECIONADO
                          if (date) {
                            setIsDatePickerOpen(false);
                          }
                        }}
                        disabled={(date) =>
                          !selectedServiceId || date < startOfToday()
                        }
                      />
                    </PopoverContent>
                  </Popover>
                </FormItem>
              )}
            />

            {/* PROFISSIONAL */}
            <FormField
              control={form.control}
              name="barberId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-label-medium-size text-content-primary">
                    Profissional
                  </FormLabel>
                  <FormControl>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue("time", "");
                      }}
                      value={field.value}
                      disabled={!selectedServiceId || !selectedDate}
                    >
                      <SelectTrigger
                        className="
    w-full justify-between text-left font-normal
    bg-background-tertiary border-border-primary text-content-primary
    focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand
    focus:border-border-brand focus-visible:border-border-brand
    disabled:opacity-100 disabled:cursor-not-allowed disabled:pointer-events-none
  "
                      >
                        <div className="flex items-center gap-2">
                          <UserCircle className="h-4 w-4 text-content-brand" />
                          <SelectValue
                            placeholder={
                              !selectedServiceId
                                ? "Selecione um serviço"
                                : !selectedDate
                                  ? "Selecione uma data"
                                  : "Selecione o profissional"
                            }
                          />
                        </div>
                      </SelectTrigger>

                      <SelectContent>
                        {!selectedServiceId || !selectedDate ? (
                          <SelectItem disabled value="no-selection">
                            Selecione o serviço e a data
                          </SelectItem>
                        ) : isLoadingBarbers ? (
                          <SelectItem disabled value="loading-barbers">
                            Carregando profissionais disponíveis...
                          </SelectItem>
                        ) : filteredBarbers.length === 0 ? (
                          <SelectItem value="no-barbers">
                            Nenhum profissional disponível para este serviço
                            nessa data
                          </SelectItem>
                        ) : (
                          filteredBarbers.map((barber) => (
                            <SelectItem key={barber.id} value={barber.id}>
                              {barber.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </FormControl>
                </FormItem>
              )}
            />

            {/* HORA */}
            <FormField
              control={form.control}
              name="time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-label-medium-size text-content-primary">
                    Hora
                  </FormLabel>
                  <FormControl>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                      }}
                      value={field.value}
                      disabled={
                        !selectedServiceId || !selectedDate || !selectedBarberId
                      }
                    >
                      <SelectTrigger
                        className="
    w-full justify-between text-left font-normal
    bg-background-tertiary border-border-primary text-content-primary
    focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand
    focus:border-border-brand focus-visible:border-border-brand
    disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none
  "
                      >
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-content-brand" />
                          <SelectValue
                            placeholder={
                              !selectedServiceId
                                ? "Selecione um serviço"
                                : !selectedDate
                                  ? "Selecione uma data"
                                  : !selectedBarberId
                                    ? "Selecione o profissional"
                                    : "Selecione um horário"
                            }
                          />
                        </div>
                      </SelectTrigger>

                      <SelectContent>
                        {!selectedServiceId ||
                        !selectedDate ||
                        !selectedBarberId ? (
                          <SelectItem disabled value="no-selection">
                            Selecione o serviço, a data e o profissional
                          </SelectItem>
                        ) : availableTimes.length === 0 ? (
                          <SelectItem disabled value="no-times">
                            Sem horários disponíveis
                          </SelectItem>
                        ) : (
                          availableTimes.map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="brand"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isEdit ? "Salvar alterações" : "Agendar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
