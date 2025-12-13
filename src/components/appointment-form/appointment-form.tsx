// src/components/appointment-form/schema.ts
import z from "zod";
import { startOfToday, setHours, setMinutes } from "date-fns";

function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

export const appointmentFormSchema = z
  .object({
    clientName: z.string().min(3, "Seu nome é obrigatório"),

    // Aceita máscara, mas valida por dígitos (DDD + 9 dígitos)
    phone: z
      .string()
      .min(1, "O telefone é obrigatório")
      .refine((val) => onlyDigits(val).length === 11, {
        message: "Informe um telefone válido com DDD (11 dígitos).",
      }),

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
