// src/components/appointment-form/schema.ts
import z from "zod";
import { startOfToday, setHours, setMinutes } from "date-fns";

export const appointmentFormSchema = z
  .object({
    clientName: z.string().min(3, "Seu nome é obrigatório"),
    phone: z.string().min(11, "O telefone é obrigatório"),

    // ✅ NOVO: unidade selecionada
    unitId: z.string().min(1, "A unidade é obrigatória"),

    // ID do serviço escolhido
    serviceId: z.string().min(1, "O serviço é obrigatório"),

    // Nome do serviço (espelho)
    description: z.string().min(1, "O serviço é obrigatório"),

    scheduleAt: z
      .date({
        error: "A data é obrigatória",
      })
      .min(startOfToday(), {
        message: "A data não pode ser no passado",
      }),

    time: z.string().min(1, "A hora é obrigatória"),
    barberId: z.string().min(1, "O barbeiro é obrigatório"),
  })
  .refine(
    (data) => {
      const [hour, minute] = data.time.split(":");
      const scheduleDateTime = setMinutes(
        setHours(data.scheduleAt, Number(hour)),
        Number(minute),
      );

      return scheduleDateTime > new Date();
    },
    {
      path: ["time"],
      message: "O horário não pode ser no passado",
    },
  );

export type AppointFormValues = z.infer<typeof appointmentFormSchema>;
