"use client";

import Link from "next/link";
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
  Store,
  User,
  UserCircle,
  Users,
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
  getAvailableBarbersForDateAndServiceAction,
} from "@/app/admin/dashboard/actions";
import { ReactNode, useEffect, useMemo, useState } from "react";
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

type AppointmentBarber = {
  id: string;
  name: string;
  email: string;
  phone: string;
  isActive: boolean;
  role: "BARBER";
  serviceIds?: string[];

  // ✅ B.2: vínculos de unidade do profissional (BarberUnit)
  unitIds?: string[];
};

type ClientPlanSummary = {
  planId: string;
  planName: string;
  status: "ACTIVE" | "EXPIRED" | "CANCELED";
  usedBookings: number;
  totalBookings: number;
  endDate: string | Date;
  serviceIds: string[];
};

export type AppointmentClientOption = {
  id: string;
  name: string;
  phone: string;
};

export type UnitOption = {
  id: string;
  name: string;
  isActive?: boolean;
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
  // ✅ Importante: NÃO filtra por unidade, porque a regra anti-teletransporte é global por barbeiro
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

      const matchedServiceById = (appt as any).serviceId
        ? servicesList.find((s) => s.id === (appt as any).serviceId)
        : undefined;

      const matchedServiceByName = servicesList.find(
        (s) => s.name === (appt as any).description,
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

// ✅ B.2: filtra profissionais pela UNIDADE escolhida (BarberUnit)
function filterProfessionalsByUnit(
  list: AppointmentBarber[],
  selectedUnitId: string | undefined,
): AppointmentBarber[] {
  if (!selectedUnitId) return sortProfessionals(list);

  return sortProfessionals(
    list.filter((barber) => {
      // backward-compatible: se não vier unitIds, não filtra
      if (!barber.unitIds || barber.unitIds.length === 0) return true;
      return barber.unitIds.includes(selectedUnitId);
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
      if (!barber.serviceIds || barber.serviceIds.length === 0) return true;
      return barber.serviceIds.includes(selectedServiceId);
    }),
  );
}

type AppointmentFormProps = {
  appointment?: Appointment;
  appointments?: Appointment[];

  /**
   * Lista de profissionais ativos já normalizados.
   * Idealmente incluindo serviceIds + unitIds.
   */
  barbers: AppointmentBarber[];
  services?: Service[];

  /**
   * Unidades ativas para o cliente escolher (Item B).
   */
  units?: UnitOption[];

  /**
   * ✅ ADMIN: unidade "forçada" pelo contexto (cookie/escopo do admin).
   * - quando definida, o modal NÃO precisa renderizar select de unidade
   * - o form mantém unitId estável e injeta automaticamente
   */
  forcedUnitId?: string | null;

  children?: ReactNode;

  defaultClientName?: string;
  clientPlan?: ClientPlanSummary | null;

  mode?: "client" | "admin";
  clients?: AppointmentClientOption[];

  open?: boolean;
  onOpenChange?: (v: boolean) => void;
};

export const AppointmentForm = ({
  appointment,
  appointments = [],
  barbers,
  services,
  units = [],
  forcedUnitId,
  children,
  defaultClientName,
  clientPlan,
  mode = "client",
  clients = [],
  open,
  onOpenChange,
}: AppointmentFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const isEdit = !!appointment?.id;
  const servicesList = services ?? [];

  const activeUnits = useMemo(
    () => (units ?? []).filter((u) => u.isActive !== false),
    [units],
  );

  const { data: session } = useSession();
  const role = (session?.user as any)?.role;

  const sessionClientName =
    role === "CLIENT" ? ((session?.user as any)?.name ?? "") : "";
  const sessionPhone =
    role === "CLIENT" ? ((session?.user as any)?.phone ?? "") : "";

  const isAdminMode = mode === "admin";

  const initialClientName = isAdminMode
    ? ""
    : (defaultClientName ?? sessionClientName ?? "");
  const initialPhone = isAdminMode ? "" : sessionPhone || "";

  const [selectedClientId, setSelectedClientId] = useState<string>("");

  const selectedClient = useMemo(() => {
    if (!isAdminMode) return null;
    if (!selectedClientId) return null;
    return clients.find((c) => c.id === selectedClientId) ?? null;
  }, [isAdminMode, selectedClientId, clients]);

  // ✅ Schema não precisa validar unitId pra compilar o mundo
  type FormValues = AppointFormValues & { unitId: string };

  const form = useForm<FormValues>({
    resolver: zodResolver(appointmentFormSchema as any),
    defaultValues: {
      clientName: initialClientName,
      phone: initialPhone,
      unitId: "",
      serviceId: "",
      description: "",
      scheduleAt: undefined as any,
      time: "",
      barberId: "",
    },
  });

  const dialogOpen = open ?? isOpen;

  const handleOpenChange = (v: boolean) => {
    onOpenChange?.(v);
    if (open == null) setIsOpen(v);
  };

  const canProceedAdmin = !isAdminMode || !!selectedClientId;

  const adminHasForcedUnit = isAdminMode && !!forcedUnitId;

  // ✅ ADMIN: injeta unitId automaticamente (sem UI de unidade)
  useEffect(() => {
    if (!adminHasForcedUnit) return;
    if (isEdit) return;

    const currentUnitId = form.getValues("unitId");
    if (currentUnitId !== forcedUnitId) {
      form.setValue("unitId", forcedUnitId as string, { shouldDirty: false });

      // ✅ unidade mudou (contexto admin), então reseta seleção dependente
      form.setValue("serviceId", "");
      form.setValue("description", "");
      form.setValue("scheduleAt", undefined as any);
      form.setValue("time", "");
      form.setValue("barberId", "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminHasForcedUnit, forcedUnitId, isEdit]);

  // ✅ FIX A: sessão pode chegar depois, então injeta nome/telefone (modo client, novo)
  useEffect(() => {
    if (isAdminMode) return;
    if (isEdit) return;

    const currentPhone = form.getValues("phone");
    const currentName = form.getValues("clientName");

    if (!currentName && sessionClientName) {
      form.setValue("clientName", sessionClientName, { shouldDirty: false });
    }

    if (!currentPhone && sessionPhone) {
      form.setValue("phone", sessionPhone, { shouldDirty: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminMode, isEdit, sessionClientName, sessionPhone]);

  // ✅ Item B: se tiver 1 unidade ativa, auto seleciona (modo client, novo)
  useEffect(() => {
    if (isAdminMode) return;
    if (isEdit) return;

    const currentUnitId = form.getValues("unitId");

    if (!currentUnitId && activeUnits.length === 1) {
      form.setValue("unitId", activeUnits[0].id, { shouldDirty: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminMode, isEdit, activeUnits.length, activeUnits[0]?.id]);

  // Quando selecionar cliente no ADMIN, preenche clientName/phone
  useEffect(() => {
    if (!isAdminMode) return;

    if (!selectedClient) {
      form.setValue("clientName", "");
      form.setValue("phone", "");
      return;
    }

    form.setValue("clientName", selectedClient.name ?? "");
    form.setValue("phone", selectedClient.phone ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminMode, selectedClientId]);

  // ✅ Em edição: tenta puxar unitId do appointment
  useEffect(() => {
    if (!appointment) return;

    const apptUnitId = (appointment as any)?.unitId as string | undefined;
    if (apptUnitId) {
      form.setValue("unitId", apptUnitId, { shouldDirty: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment?.id]);

  const resetFormToInitial = () => {
    form.reset({
      clientName: initialClientName,
      phone: initialPhone,
      unitId: adminHasForcedUnit ? (forcedUnitId as string) : "",
      serviceId: "",
      description: "",
      scheduleAt: undefined as any,
      time: "",
      barberId: "",
    });
  };

  const onSubmit = async (data: FormValues) => {
    console.log("[AppointmentForm] submit data:", {
      mode: isAdminMode ? "admin" : "client",
      isEdit,
      forcedUnitId,
      selectedClientId: isAdminMode ? selectedClientId : null,

      unitId: data.unitId,
      serviceId: data.serviceId,
      barberId: data.barberId,

      scheduleAt: data.scheduleAt,
      time: data.time,

      activeUnitsCount: activeUnits.length,
    });

    if (isAdminMode && !selectedClientId) {
      toast.error("Selecione um cliente para continuar.");
      return;
    }

    if (!data.unitId) {
      toast.error("Selecione uma unidade para continuar.");
      return;
    }

    const [hour, minute] = data.time.split(":");
    const scheduleAt = new Date(data.scheduleAt as any);
    scheduleAt.setHours(Number(hour), Number(minute), 0, 0);

    const payload = {
      clientId: isAdminMode ? selectedClientId : undefined,
      clientName: data.clientName,
      phone: data.phone,
      unitId: data.unitId,
      description: data.description,
      scheduleAt,
      barberId: data.barberId,
      serviceId: data.serviceId,
    };

    console.log("[AppointmentForm] payload -> server:", payload);

    const result = isEdit
      ? await updateAppointment((appointment as any).id, payload as any)
      : await createAppointment(payload as any);

    if ((result as any)?.error) {
      toast.error((result as any).error);
      return;
    }

    toast.success(
      `Agendamento ${isEdit ? "atualizado" : "criado"} com sucesso!`,
    );

    handleOpenChange(false);

    resetFormToInitial();

    if (isAdminMode) setSelectedClientId("");
  };

  const handleSubmit = form.handleSubmit(onSubmit as any, (errors) => {
    const firstError = Object.values(errors)[0];
    if (!firstError) return;

    const message = (firstError as any)?.message;

    if (message) toast.error(String(message));
    else toast.error("Verifique os campos obrigatórios.");
  });

  useEffect(() => {
    if (!dialogOpen) {
      if (isAdminMode && !isEdit) {
        setSelectedClientId("");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen]);

  useEffect(() => {
    if (!appointment) {
      resetFormToInitial();
      return;
    }

    const date = new Date((appointment as any).scheduleAt);
    const time = format(date, "HH:mm");

    const matchedServiceById = (appointment as any).serviceId
      ? servicesList.find(
          (service) => service.id === (appointment as any).serviceId,
        )
      : undefined;

    const matchedServiceByName = servicesList.find(
      (service) => service.name === (appointment as any).description,
    );

    const finalService = matchedServiceById ?? matchedServiceByName;

    form.reset({
      clientName: (appointment as any).clientName,
      phone: (appointment as any).phone,
      unitId:
        (((appointment as any)?.unitId ?? "") as string) ||
        (adminHasForcedUnit ? (forcedUnitId as string) : ""),
      serviceId: finalService?.id ?? (appointment as any).serviceId ?? "",
      description: (appointment as any).description ?? finalService?.name ?? "",
      scheduleAt: date as any,
      time,
      barberId: (appointment as any).barberId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointment, servicesList.length, initialClientName, initialPhone]);

  const selectedUnitId = form.watch("unitId");
  const selectedServiceId = form.watch("serviceId");
  const selectedDate = form.watch("scheduleAt");
  const selectedBarberId = form.watch("barberId");

  /**
   * ✅ B.2: Serviços filtrados pela unidade, mas pela regra correta:
   * - pega os profissionais daquela unidade (BarberUnit)
   * - junta todos os serviceIds desses profissionais (ServiceProfessional)
   * - filtra os serviços por esse Set
   */
  const servicesForUnit = useMemo(() => {
    if (!selectedUnitId) return servicesList;

    // ✅ 1) trava por unitId do serviço (a regra real do schema)
    const servicesFromThisUnit = servicesList.filter((s: any) => {
      // se vier unitId no objeto, filtra
      if (s?.unitId) return s.unitId === selectedUnitId;
      // fallback: se o tipo Service ainda não tem unitId, não quebra
      return true;
    });

    // ✅ 2) opcional: ainda restringe pelos serviços que os profissionais da unidade executam
    const barbersInSelectedUnit = filterProfessionalsByUnit(
      barbers,
      selectedUnitId,
    );
    const allowedServiceIds = new Set(
      barbersInSelectedUnit.flatMap((b) => b.serviceIds ?? []),
    );

    // legado: se não temos serviceIds, retorna só os serviços da unidade
    if (allowedServiceIds.size === 0) return servicesFromThisUnit;

    // regra final: tem que ser da unidade E estar no set
    return servicesFromThisUnit.filter((s) => allowedServiceIds.has(s.id));
  }, [servicesList, barbers, selectedUnitId]);

  const selectedServiceData = servicesForUnit.find(
    (service) => service.id === selectedServiceId,
  );

  const effectiveUnitId = selectedUnitId || "";

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

  // ===== profissionais disponíveis para a data =====
  const [availableBarbersForDate, setAvailableBarbersForDate] = useState<
    AppointmentBarber[]
  >(() => sortProfessionals(barbers));
  const [isLoadingBarbers, setIsLoadingBarbers] = useState(false);

  // ✅ TROCA DEFINITIVA: backend travado por (data + unidade + serviço)
  useEffect(() => {
    if (!selectedDate || !selectedServiceId || !effectiveUnitId) {
      setAvailableBarbersForDate(sortProfessionals(barbers));
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setIsLoadingBarbers(true);
        const isoDate = (selectedDate as any).toISOString();

        let result = (await getAvailableBarbersForDateAndServiceAction(
          isoDate,
          effectiveUnitId,
          selectedServiceId,
        )) as AppointmentBarber[];

        result = Array.isArray(result) ? result : [];

        // Em edição: garante que o profissional do appointment apareça no select
        // (mesmo se ele hoje não estiver disponível pela regra nova)
        if (isEdit && (appointment as any)?.barberId) {
          const existsInResult = result.some(
            (b) => b.id === (appointment as any).barberId,
          );
          if (!existsInResult) {
            const apptBarber = barbers.find(
              (b) => b.id === (appointment as any).barberId,
            );
            if (apptBarber) result = [...result, apptBarber];
          }
        }

        if (!cancelled) setAvailableBarbersForDate(sortProfessionals(result));
      } catch (error) {
        console.error(
          "AppointmentForm ▶ erro ao buscar profissionais disponíveis na data (data+unidade+serviço)",
          error,
        );
        if (!cancelled) setAvailableBarbersForDate(sortProfessionals([]));
      } finally {
        if (!cancelled) setIsLoadingBarbers(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    selectedDate,
    selectedServiceId,
    effectiveUnitId,
    barbers,
    isEdit,
    (appointment as any)?.barberId,
  ]);

  // ✅ B.2: (extra) aplica filtro por unidade + serviço na lista final exibida
  const barbersInUnit = filterProfessionalsByUnit(
    availableBarbersForDate,
    selectedUnitId,
  );

  const filteredBarbers = filterProfessionalsByService(
    barbersInUnit,
    selectedServiceId,
  );

  // ===== janelas de disponibilidade do profissional =====
  const [availabilityWindows, setAvailabilityWindows] = useState<
    AvailabilityWindow[] | undefined
  >(undefined);

  useEffect(() => {
    if (
      !selectedDate ||
      !selectedBarberId ||
      !selectedServiceId ||
      !effectiveUnitId
    ) {
      setAvailabilityWindows(undefined);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const iso = (selectedDate as any).toISOString();

        const windows = await getAvailabilityWindowsForBarberOnDateAction(
          selectedBarberId as any,
          iso,
          effectiveUnitId,
        );

        if (!cancelled) {
          if (!windows) setAvailabilityWindows(undefined);
          else setAvailabilityWindows(windows as AvailabilityWindow[]);
        }
      } catch (error) {
        console.error(
          "AppointmentForm ▶ erro ao buscar disponibilidade do profissional",
          error,
        );
        if (!cancelled) setAvailabilityWindows(undefined);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedDate, selectedBarberId, selectedServiceId, effectiveUnitId]);

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
        selectedDate: selectedDate as any,
        selectedBarberId: selectedBarberId as any,
        serviceDurationMinutes: selectedServiceData.durationMinutes,
        appointments,
        currentAppointmentId: (appointment as any)?.id,
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
      currentAppointmentId: (appointment as any)?.id,
    });
    availableTimes = [];
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children ? (
          children
        ) : (
          <Button variant={isEdit ? "edit2" : "brand"} size="sm">
            {isEdit ? "Editar" : "Agendar"}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        variant="appointment"
        overlayVariant="blurred"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle size="modal">
            {isEdit
              ? "Editar agendamento"
              : isAdminMode
                ? "Novo agendamento"
                : "Agende um atendimento"}
          </DialogTitle>
          <DialogDescription size="modal">
            {isEdit
              ? "Atualize os dados deste atendimento:"
              : isAdminMode
                ? "Selecione um cliente e preencha os dados para realizar o agendamento:"
                : "Preencha os dados do cliente para realizar o agendamento:"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* ===========================
             *  MODO ADMIN: SELECIONAR CLIENTE
             * =========================== */}
            {isAdminMode && !isEdit && (
              <div className="space-y-2">
                <FormLabel className="text-label-medium-size text-content-primary">
                  Cliente
                </FormLabel>

                <Select
                  value={selectedClientId}
                  onValueChange={(value) => {
                    setSelectedClientId(value);

                    form.setValue("serviceId", "");
                    form.setValue("description", "");
                    form.setValue("scheduleAt", undefined as any);
                    form.setValue("time", "");
                    form.setValue("barberId", "");

                    // ✅ admin com unidade forçada NÃO perde unitId ao trocar cliente
                    if (adminHasForcedUnit) {
                      form.setValue("unitId", forcedUnitId as string, {
                        shouldDirty: false,
                      });
                    } else {
                      form.setValue("unitId", "");
                    }
                  }}
                >
                  <SelectTrigger>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-content-brand" />
                      <SelectValue placeholder="Selecione um cliente" />
                    </div>
                  </SelectTrigger>

                  <SelectContent>
                    {clients.length === 0 ? (
                      <SelectItem disabled value="no-clients">
                        Nenhum cliente cadastrado
                      </SelectItem>
                    ) : (
                      clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} {c.phone ? `• ${c.phone}` : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>

                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-content-secondary">
                    Não encontrou? Cadastre em <b>Clientes</b> e volte para
                    concluir.
                  </p>

                  <Button asChild variant="outline" size="sm">
                    <Link href="/admin/clients">Cadastrar cliente</Link>
                  </Button>
                </div>

                {!!selectedClient && (
                  <div className="rounded-lg border border-border-primary bg-background-tertiary p-3">
                    <p className="text-sm text-content-primary font-medium">
                      {selectedClient.name}
                    </p>
                    <p className="text-xs text-content-secondary">
                      {selectedClient.phone}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ===========================
             *  MODO CLIENT: CAMPOS + UNIDADE (Item B)
             * =========================== */}
            {!isAdminMode && (
              <>
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
                            name={field.name}
                            value={field.value ?? ""}
                            onAccept={(value) => field.onChange(String(value))}
                            onBlur={field.onBlur}
                            inputRef={field.ref}
                            placeholder="(99) 99999-9999"
                            mask="(00) 00000-0000"
                            className="pl-10 flex h-12 w-full rounded-md border border-border-primary bg-background-tertiary px-3 py-2 text-sm text-content-primary ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-content-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-0 focus-visible:ring-border-brand disabled:cursor-not-allowed disabled:opacity-50 hover:border-border-secondary focus:border-border-brand focus-visible:border-border-brand aria-invalid:ring-destructive/20 aria-invalid:border-destructive"
                          />
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* UNIDADE */}
                <FormField
                  control={form.control}
                  name="unitId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-label-medium-size text-content-primary">
                        Unidade
                      </FormLabel>
                      <FormControl>
                        <Select
                          value={field.value ?? ""}
                          onValueChange={(value) => {
                            field.onChange(value);

                            // Trocar unidade reseta o fluxo
                            form.setValue("serviceId", "");
                            form.setValue("description", "");
                            form.setValue("scheduleAt", undefined as any);
                            form.setValue("time", "");
                            form.setValue("barberId", "");
                          }}
                          disabled={activeUnits.length <= 1}
                        >
                          <SelectTrigger>
                            <div className="flex items-center gap-2">
                              <Store className="h-4 w-4 text-content-brand" />
                              <SelectValue
                                placeholder={
                                  activeUnits.length === 0
                                    ? "Nenhuma unidade disponível"
                                    : activeUnits.length === 1
                                      ? "Unidade selecionada automaticamente"
                                      : "Selecione a unidade"
                                }
                              />
                            </div>
                          </SelectTrigger>

                          <SelectContent>
                            {activeUnits.length === 0 ? (
                              <SelectItem disabled value="no-units">
                                Nenhuma unidade cadastrada/ativa
                              </SelectItem>
                            ) : (
                              activeUnits.map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </FormControl>
                    </FormItem>
                  )}
                />
              </>
            )}

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

                        const service = servicesForUnit.find(
                          (s) => s.id === value,
                        );

                        form.setValue("description", service?.name ?? "");
                        form.setValue("scheduleAt", undefined as any);
                        form.setValue("time", "");
                        form.setValue("barberId", "");
                      }}
                      value={field.value}
                      disabled={
                        !canProceedAdmin ||
                        (!isAdminMode &&
                          activeUnits.length > 1 &&
                          !selectedUnitId)
                      }
                    >
                      <SelectTrigger>
                        <div className="flex items-center gap-2">
                          <Scissors className="h-4 w-4 text-content-brand" />
                          <SelectValue
                            placeholder={
                              !canProceedAdmin
                                ? "Selecione um cliente"
                                : !isAdminMode &&
                                    activeUnits.length > 1 &&
                                    !selectedUnitId
                                  ? "Selecione a unidade"
                                  : "Selecione o serviço"
                            }
                          />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {servicesForUnit.length === 0 ? (
                          <SelectItem disabled value="no-services">
                            Nenhum serviço disponível
                          </SelectItem>
                        ) : (
                          servicesForUnit.map((service) => (
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
                          disabled={
                            !selectedServiceId ||
                            !canProceedAdmin ||
                            (!isAdminMode &&
                              activeUnits.length > 1 &&
                              !selectedUnitId)
                          }
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
                              className="text-content-brand"
                              size={20}
                            />
                            {field.value ? (
                              format(field.value as any, "dd/MM/yyyy")
                            ) : (
                              <span>
                                {!canProceedAdmin
                                  ? "Selecione um cliente"
                                  : !isAdminMode &&
                                      activeUnits.length > 1 &&
                                      !selectedUnitId
                                    ? "Selecione a unidade"
                                    : !selectedServiceId
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
                        selected={field.value as any}
                        onSelect={(date) => {
                          field.onChange(date ?? undefined);
                          form.setValue("time", "");
                          form.setValue("barberId", "");
                          if (date) setIsDatePickerOpen(false);
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
                      disabled={
                        !selectedServiceId ||
                        !selectedDate ||
                        !canProceedAdmin ||
                        (!isAdminMode &&
                          activeUnits.length > 1 &&
                          !selectedUnitId)
                      }
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
                              !canProceedAdmin
                                ? "Selecione um cliente"
                                : !isAdminMode &&
                                    activeUnits.length > 1 &&
                                    !selectedUnitId
                                  ? "Selecione a unidade"
                                  : !selectedServiceId
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
                      onValueChange={(value) => field.onChange(value)}
                      value={field.value}
                      disabled={
                        !selectedServiceId ||
                        !selectedDate ||
                        !selectedBarberId ||
                        !canProceedAdmin ||
                        (!isAdminMode &&
                          activeUnits.length > 1 &&
                          !selectedUnitId)
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
                              !canProceedAdmin
                                ? "Selecione um cliente"
                                : !isAdminMode &&
                                    activeUnits.length > 1 &&
                                    !selectedUnitId
                                  ? "Selecione a unidade"
                                  : !selectedServiceId
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
                disabled={
                  form.formState.isSubmitting ||
                  (isAdminMode && !selectedClientId)
                }
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
