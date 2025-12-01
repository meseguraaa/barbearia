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
import { format, setHours, setMinutes, startOfToday } from "date-fns";
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
import { getAvailableTimes } from "@/components/appointment-form/constants-and-utils";
import {
  appointmentFormSchema,
  AppointFormValues,
} from "@/components/appointment-form/schema";
import { Service } from "@/types/service";
import { useSession } from "next-auth/react"; // 🔹 NOVO

// mesmo formato do util
type AvailabilityWindow = {
  startTime: string;
  endTime: string;
};

// Tipo normalizado de barbeiro só para o formulário
type AppointmentBarber = {
  id: string;
  name: string; // sempre string pra exibir direitinho
  email: string;
  phone: string;
  isActive: boolean;
  role: "BARBER";
};

type AppointmentFormProps = {
  appointment?: Appointment;
  /**
   * Lista de agendamentos já existentes (do dia atual ou vários dias).
   * A função interna filtra por data.
   */
  appointments?: Appointment[];
  /**
   * Lista de barbeiros ativos já normalizados
   */
  barbers: AppointmentBarber[];
  /**
   * Lista de serviços ativos
   */
  services?: Service[];
  /**
   * Children para usos onde o componente é chamado como:
   * <AppointmentForm>...</AppointmentForm>
   * (não é obrigatório usar)
   */
  children?: ReactNode;
  /**
   * Nome padrão do cliente (ex.: vindo do usuário logado)
   * Continua existindo, mas agora é opcional — se não vier,
   * usamos o nome do CLIENT da sessão.
   */
  defaultClientName?: string;
};

export const AppointmentForm = ({
  appointment,
  appointments = [],
  barbers,
  services,
  children, // mantido para compatibilidade
  defaultClientName,
}: AppointmentFormProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const isEdit = !!appointment?.id;

  // garante array estável dentro do componente
  const servicesList = services ?? [];

  // 🔹 NOVO: pegar sessão pra saber se é CLIENT e qual o nome
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const sessionClientName =
    role === "CLIENT" ? ((session?.user as any)?.name ?? "") : "";

  // Nome inicial que o formulário vai usar:
  // 1º prioridade: prop defaultClientName (se vier explícito)
  // 2º prioridade: nome do CLIENT autenticado
  // 3º: string vazia
  const initialClientName = defaultClientName ?? sessionClientName ?? "";

  const form = useForm<AppointFormValues>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: {
      clientName: initialClientName,
      phone: "",
      serviceId: "",
      description: "",
      scheduleAt: undefined,
      time: "",
      barberId: "",
    },
  });

  const onSubmit = async (data: AppointFormValues) => {
    const [hour, minute] = data.time.split(":");

    const scheduleAt = setMinutes(
      setHours(data.scheduleAt, Number(hour)),
      Number(minute),
    );

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
      phone: "",
      serviceId: "",
      description: "",
      scheduleAt: undefined,
      time: "",
      barberId: "",
    });
  };

  // Handler que transforma erros de validação em toast
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
    // novo agendamento
    if (!appointment) {
      form.reset({
        clientName: initialClientName,
        phone: "",
        serviceId: "",
        description: "",
        scheduleAt: undefined,
        time: "",
        barberId: "",
      });
      return;
    }

    // edição
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
  }, [appointment, servicesList.length, initialClientName]);

  // log leve pra garantir que está renderizando por agendamento
  useEffect(() => {
    if (appointment?.id) {
      console.log("AppointmentForm ▶ render para agendamento", {
        id: appointment.id,
        clientName: appointment.clientName,
      });
    }
  }, [appointment?.id, appointment?.clientName]);

  // Observa campos que mandam no fluxo
  const selectedServiceId = form.watch("serviceId");
  const selectedDate = form.watch("scheduleAt");
  const selectedTime = form.watch("time");
  const selectedBarberId = form.watch("barberId");

  const selectedServiceData = servicesList.find(
    (service) => service.id === selectedServiceId,
  );

  const selectedServiceName = selectedServiceData?.name ?? "";

  // ===== NOVO: buscar barbeiros disponíveis para a data =====
  const [availableBarbers, setAvailableBarbers] =
    useState<AppointmentBarber[]>(barbers);
  const [isLoadingBarbers, setIsLoadingBarbers] = useState(false);

  useEffect(() => {
    // sem data → lista padrão (todos ativos)
    if (!selectedDate) {
      setAvailableBarbers(barbers);
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

        // Garantir que sempre seja array
        result = Array.isArray(result) ? result : [];

        // Se estamos editando e o barbeiro do agendamento não estiver na lista,
        // adiciona ele pra não "sumir" da edição.
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
          setAvailableBarbers(result);
        }
      } catch (error) {
        console.error(
          "AppointmentForm ▶ erro ao buscar barbeiros disponíveis na data",
          error,
        );
        if (!cancelled) {
          // fallback: mostra todos
          setAvailableBarbers(barbers);
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

  // ===== NOVO: buscar janelas de disponibilidade do barbeiro =====
  const [availabilityWindows, setAvailabilityWindows] = useState<
    AvailabilityWindow[] | undefined
  >(undefined);

  useEffect(() => {
    // se não tem data ou barbeiro, não tem por que buscar
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
          // windows pode ser null, [] ou array de janelas
          if (!windows) {
            setAvailabilityWindows(undefined);
          } else {
            setAvailabilityWindows(windows as AvailabilityWindow[]);
          }
        }
      } catch (error) {
        console.error(
          "AppointmentForm ▶ erro ao buscar disponibilidade do barbeiro",
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

  // Protege contra qualquer erro em getAvailableTimes
  let availableTimes: string[] = [];

  try {
    if (selectedServiceId && selectedDate && selectedBarberId) {
      availableTimes =
        getAvailableTimes({
          date: selectedDate,
          service: selectedServiceName,
          appointments,
          currentAppointmentId: appointment?.id,
          availabilityWindows,
        }) ?? [];
    } else {
      availableTimes = [];
    }
  } catch (error) {
    console.error("AppointmentForm ▶ erro em getAvailableTimes", {
      error,
      hasAppointments: appointments?.length,
      currentAppointmentId: appointment?.id,
    });
    availableTimes = [];
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {/* TODO: se quiser usar children custom no futuro,
            aqui é o lugar pra trocar o Button pelo children */}
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

            {/* SERVIÇO (1º passo) */}
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

                        // espelha o nome do serviço na descrição
                        form.setValue("description", service?.name ?? "");

                        // Mudou serviço → limpa data, hora e barbeiro
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

                  {/* Info do serviço selecionado: valor e duração */}
                  {selectedServiceData && (
                    <div className="mt-2 text-paragraph-small-size text-content-secondary">
                      Valor:{" "}
                      <span className="font-semibold">
                        R$ {selectedServiceData.price.toFixed(2)}
                      </span>{" "}
                      • Duração:{" "}
                      <span className="font-semibold">
                        {selectedServiceData.durationMinutes} minutos
                      </span>
                    </div>
                  )}
                </FormItem>
              )}
            />

            {/* DATA (2º passo) */}
            <FormField
              control={form.control}
              name="scheduleAt"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className="text-label-medium-size text-content-primary">
                    Data
                  </FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          disabled={!selectedServiceId}
                          className={cn(
                            "w-full justify-between text-left font-normal bg-background-tertiary border-border-primary text-content-primary hover:bg-background-tertiary hover:border-border-secondary hover:text-content-primary focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand focus:border-border-brand focus-visible:border-border-brand disabled:opacity-60 disabled:cursor-not-allowed",
                            !field.value && "text-content-secondary",
                          )}
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
                          // Mudou data → limpa hora e barbeiro
                          form.setValue("time", "");
                          form.setValue("barberId", "");
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

            {/* BARBEIRO (3º passo) */}
            <FormField
              control={form.control}
              name="barberId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-label-medium-size text-content-primary">
                    Barbeiro
                  </FormLabel>
                  <FormControl>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        // Mudou barbeiro → limpa horário
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
    disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none
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
                                  : "Selecione o barbeiro"
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
                            Carregando barbeiros disponíveis...
                          </SelectItem>
                        ) : availableBarbers.length === 0 ? (
                          <SelectItem disabled value="no-barbers">
                            Nenhum barbeiro disponível nessa data
                          </SelectItem>
                        ) : (
                          availableBarbers.map((barber) => (
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

            {/* HORA (4º passo) */}
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
                                    ? "Selecione o barbeiro"
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
                            Selecione o serviço, a data e o barbeiro
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
