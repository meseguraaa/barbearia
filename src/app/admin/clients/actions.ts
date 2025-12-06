"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import z from "zod";

const createClientSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().min(1, "Telefone é obrigatório"),
  birthday: z.string().min(1, "Data de nascimento é obrigatória"),
});

export async function createClientAction(formData: FormData): Promise<void> {
  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    birthday: formData.get("birthday"),
  };

  const parsed = createClientSchema.safeParse(raw);

  if (!parsed.success) {
    console.error(parsed.error.flatten().fieldErrors);
    return;
  }

  const { name, email, phone, birthday } = parsed.data;

  // Se já existir usuário com esse e-mail, não faz nada aqui.
  // A validação com toast é feita no client antes de submeter.
  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    // Segurança extra: não vamos sobrescrever dados aqui.
    return;
  }

  // yyyy-MM-dd OU dd/MM/yyyy -> Date
  let birthdayDate: Date | null = null;

  if (birthday) {
    const trimmed = birthday.trim();

    try {
      if (trimmed.includes("-")) {
        // formato: yyyy-MM-dd
        const [year, month, day] = trimmed.split("-");
        birthdayDate = new Date(
          Number(year),
          Number(month) - 1,
          Number(day),
          0,
          0,
          0,
        );
      } else if (trimmed.includes("/")) {
        // formato: dd/MM/yyyy
        const [day, month, year] = trimmed.split("/");
        birthdayDate = new Date(
          Number(year),
          Number(month) - 1,
          Number(day),
          0,
          0,
          0,
        );
      }
    } catch (e) {
      console.error("Erro ao converter data de nascimento:", e);
    }
  }

  await prisma.user.create({
    data: {
      name,
      email,
      phone,
      birthday: birthdayDate,
      role: "CLIENT",
    },
  });

  revalidatePath("/admin/clients");
}
