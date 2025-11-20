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
import { createAppointment, updateAppointment } from "@/app/actions";
import { useEffect, useState } from "react";
import { Appointment } from "@/types/appointment";
import { Barber } from "@/types/barber";
import {
  SERVICE_OPTIONS,
  getAvailableTimes,
} from "@/components/appointment-form/constants-and-utils";
import {
  appointmentFormSchema,
  AppointFormValues,
} from "@/components/appointment-form/schema";

type AppointmentFormProps = {
  appointment?: Appointment;
  children?: React.ReactNode;
  /**
   * Lista de agendamentos já existentes (do dia atual ou vários dias).
   * A função interna filtra por data.
   */
  appointments?: Appointment[];
  /**
   * Lista de barbeiros ativos
   */
  barbers: Barber[];
};

export const AppointmentForm = ({
  appointment,
  children,
  appointments = [],
  barbers,
}: AppointmentFormProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const form = useForm<AppointFormValues>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: {
      clientName: "",
      phone: "",
      description: undefined,
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
    };

    const isEdit = !!appointment?.id;

    const result = isEdit
      ? await updateAppointment(appointment.id, payload)
      : await createAppointment(payload);

    if (result?.error) {
      toast.error(result.error);
      return;
    }

    toast.success(
      `Agendamento ${isEdit ? "atualizado" : "criado"} com sucesso!`,
    );

    setIsOpen(false);
    form.reset();
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
    if (!appointment) {
      form.reset({
        clientName: "",
        phone: "",
        description: undefined,
        scheduleAt: undefined,
        time: "",
        barberId: "",
      });
      return;
    }

    const date = new Date(appointment.scheduleAt);
    const time = format(date, "HH:mm");

    form.reset({
      clientName: appointment.clientName,
      phone: appointment.phone,
      description: appointment.description as AppointFormValues["description"],
      scheduleAt: date,
      time,
      barberId: appointment.barberId,
    });
  }, [appointment, form]);

  // 🕒 Observa campos que mandam no fluxo
  const selectedService = form.watch("description");
  const selectedDate = form.watch("scheduleAt");
  const selectedTime = form.watch("time");
  const selectedBarberId = form.watch("barberId");

  const availableTimes = getAvailableTimes({
    date: selectedDate,
    service: selectedService,
    appointments,
    currentAppointmentId: appointment?.id,
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}

      <DialogContent
        variant="appointment"
        overlayVariant="blurred"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle size="modal">Agende um atendimento</DialogTitle>
          <DialogDescription size="modal">
            Preencha os dados do cliente para realizar o agendamento:
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-label-medium-size text-content-primary">
                    Serviço
                  </FormLabel>
                  <FormControl>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
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
                        {SERVICE_OPTIONS.map((service) => (
                          <SelectItem key={service} value={service}>
                            {service}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                </FormItem>
              )}
            />

            {/* DATA & HORA (2º passo) */}
            <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
              {/* DATA */}
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
                            disabled={!selectedService}
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
                                  {!selectedService
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
                            !selectedService || date < startOfToday()
                          }
                        />
                      </PopoverContent>
                    </Popover>
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
                          // Mudou horário → limpa barbeiro
                          form.setValue("barberId", "");
                        }}
                        value={field.value}
                        disabled={!selectedService || !selectedDate}
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
                                !selectedService
                                  ? "Selecione um serviço"
                                  : !selectedDate
                                    ? "Selecione uma data"
                                    : "Selecione um horário"
                              }
                            />
                          </div>
                        </SelectTrigger>

                        <SelectContent>
                          {!selectedService || !selectedDate ? (
                            <SelectItem disabled value="no-selection">
                              Selecione o serviço e a data
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
            </div>

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
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={
                        !selectedService || !selectedDate || !selectedTime
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
                          <UserCircle className="h-4 w-4 text-content-brand" />
                          <SelectValue
                            placeholder={
                              !selectedService
                                ? "Selecione um serviço"
                                : !selectedDate || !selectedTime
                                  ? "Selecione data e horário"
                                  : "Selecione o barbeiro"
                            }
                          />
                        </div>
                      </SelectTrigger>

                      <SelectContent>
                        {!selectedService || !selectedDate || !selectedTime ? (
                          <SelectItem disabled value="no-selection">
                            Selecione o serviço, data e horário
                          </SelectItem>
                        ) : (
                          barbers.map((barber) => (
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

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="brand"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Agendar
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
