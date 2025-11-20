import z from "zod";
import { startOfToday, setHours, setMinutes } from "date-fns";
import { SERVICE_OPTIONS } from "@/components/appointment-form/constants-and-utils";

export const appointmentFormSchema = z
  .object({
    clientName: z.string().min(3, "Seu nome é obrigatório"),
    phone: z.string().min(11, "O telefone é obrigatório"),
    description: z.enum(SERVICE_OPTIONS, {
      message: "A descrição do serviço é obrigatória",
    }),
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
      error: "O horário não pode ser no passado",
    },
  );

export type AppointFormValues = z.infer<typeof appointmentFormSchema>;
