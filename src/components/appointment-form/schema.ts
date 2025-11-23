// src/components/appointment-form/schema.ts
import z from "zod";
import { startOfToday, setHours, setMinutes } from "date-fns";

export const appointmentFormSchema = z
  .object({
    clientName: z.string().min(3, "Seu nome é obrigatório"),
    phone: z.string().min(11, "O telefone é obrigatório"),

    // ID do serviço escolhido (vem do admin)
    serviceId: z.string().min(1, "O serviço é obrigatório"),

    // Nome do serviço (espelho, sempre string)
    description: z.string().min(1, "O serviço é obrigatório"),

    scheduleAt: z
      .date({
        // ✅ compatível com a tua versão do Zod
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
