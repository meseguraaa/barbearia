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

import {
  SERVICE_OPTIONS,
  TIME_OPTIONS,
  getAvailableTimes,
} from "./constants-and-utils";
import { AppointFormValues, appointmentFormSchema } from "./schema";

type AppointmentFormProps = {
  appointment?: Appointment;
  children?: React.ReactNode;
  appointments?: Appointment[];
};

export const AppointmentForm = ({
  appointment,
  children,
  appointments = [],
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
    },
  });

  const onSubmit = async (data: AppointFormValues) => {
    const [hour, minute] = data.time.split(":");

    const scheduleAt = setMinutes(
      setHours(data.scheduleAt, Number(hour)),
      Number(minute),
    );

    const isEdit = !!appointment?.id;

    const result = isEdit
      ? await updateAppointment(appointment.id, {
          clientName: data.clientName,
          phone: data.phone,
          description: data.description,
          scheduleAt,
        })
      : await createAppointment({
          clientName: data.clientName,
          phone: data.phone,
          description: data.description,
          scheduleAt,
        });

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

  const handleSubmit = form.handleSubmit(onSubmit, (errors) => {
    const firstError = Object.values(errors)[0];
    const message = firstError?.message;

    if (message) {
      toast.error(String(message));
    } else if (firstError) {
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
    });
  }, [appointment, form]);

  const selectedDate = form.watch("scheduleAt");
  const selectedService = form.watch("description");

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
            {/* CLIENTE */}
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-label-medium-size text-content-primary">
                    Descrição do serviço
                  </FormLabel>
                  <FormControl>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue("time", "");
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
                            className={cn(
                              "w-full justify-between text-left font-normal bg-background-tertiary border-border-primary text-content-primary hover:bg-background-tertiary hover:border-border-secondary hover:text-content-primary focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand focus:border-border-brand focus-visible:border-border-brand",
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
                                <span>Selecione uma data</span>
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
                            field.onChange(date);
                            form.setValue("time", "");
                          }}
                          disabled={(date) => date < startOfToday()}
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
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={!selectedDate || !selectedService}
                      >
                        <SelectTrigger>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-content-brand" />
                            <SelectValue
                              placeholder={
                                !selectedDate
                                  ? "Selecione uma data"
                                  : !selectedService
                                    ? "Selecione um serviço"
                                    : "Selecione um horário"
                              }
                            />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {!selectedDate || !selectedService ? (
                            <SelectItem disabled value="no-selection">
                              Selecione a data e o serviço
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
