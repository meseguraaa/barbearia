"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";

const createBarberSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().optional(),
});

export async function createBarber(formData: FormData) {
  const parsed = createBarberSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
  });

  try {
    await prisma.barber.create({
      data: {
        name: parsed.name,
        email: parsed.email,
        phone: parsed.phone,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // e-mail duplicado em barber.email
      console.warn(
        "[createBarber] E-mail já cadastrado para outro barbeiro:",
        parsed.email,
      );
      return { error: "Já existe um barbeiro com este e-mail." };
    }

    console.error("[createBarber] Erro inesperado:", err);
    return { error: "Erro ao criar barbeiro." };
  }

  revalidatePath("/admin/barber");
}

export async function toggleBarberStatus(formData: FormData) {
  const barberId = String(formData.get("barberId"));

  const barber = await prisma.barber.findUnique({
    where: { id: barberId },
  });

  if (!barber) return;

  await prisma.barber.update({
    where: { id: barberId },
    data: {
      isActive: !barber.isActive,
    },
  });

  revalidatePath("/admin/barber");
}

/**
 * Stub de reset de senha – depende de como você liga Barber com User.
 */
export async function resetBarberPassword(formData: FormData) {
  const barberId = String(formData.get("barberId"));

  console.log(
    "[resetBarberPassword] implemente aqui a lógica de reset de senha para o barbeiro",
    barberId,
  );

  // Exemplo futuro: achar o User ligado a esse barberId e gerar senha/token.

  revalidatePath("/admin/barber");
}
