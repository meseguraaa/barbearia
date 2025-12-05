"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const createBarberSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().optional(),
  password: z.string().min(5, "Senha deve ter pelo menos 5 caracteres"),
});

const updateBarberSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().optional(),
  // senha opcional na edição
  password: z.string().optional(),
});

export async function createBarber(formData: FormData) {
  const result = createBarberSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    password: formData.get("password"),
  });

  if (!result.success) {
    console.error("[createBarber] Erro de validação:", result.error.flatten());
    return { error: "Dados inválidos ao criar barbeiro." };
  }

  const parsed = result.data;

  try {
    await prisma.$transaction(async (tx) => {
      const passwordHash = await bcrypt.hash(parsed.password, 10);

      // 1) Cria o usuário que vai logar no painel
      const user = await tx.user.create({
        data: {
          name: parsed.name,
          email: parsed.email,
          role: Role.BARBER,
          passwordHash,
        },
      });

      // 2) Cria o registro do barbeiro ligado a esse usuário
      await tx.barber.create({
        data: {
          name: parsed.name,
          email: parsed.email,
          phone: parsed.phone,
          userId: user.id,
        },
      });
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // conflito de unique (pode ser em User.email ou Barber.email)
      console.warn(
        "[createBarber] E-mail já cadastrado em User ou Barber:",
        parsed.email,
      );
      return { error: "Já existe um usuário/barbeiro com este e-mail." };
    }

    console.error("[createBarber] Erro inesperado:", err);
    return { error: "Erro ao criar barbeiro." };
  }

  revalidatePath("/admin/barber");
  redirect("/admin/barber");
}

export async function updateBarber(formData: FormData) {
  const rawPassword = (formData.get("password") || "") as string;

  const result = updateBarberSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    // se vier string vazia, trata como undefined
    password: rawPassword.trim() === "" ? undefined : rawPassword,
  });

  if (!result.success) {
    console.error("[updateBarber] Erro de validação:", result.error.flatten());
    return { error: "Dados inválidos ao atualizar barbeiro." };
  }

  const parsed = result.data;

  try {
    await prisma.$transaction(async (tx) => {
      const barber = await tx.barber.findUnique({
        where: { id: parsed.id },
        include: { user: true },
      });

      if (!barber) {
        console.warn("[updateBarber] Barbeiro não encontrado:", parsed.id);
        return;
      }

      let passwordHash: string | undefined;

      if (parsed.password) {
        passwordHash = await bcrypt.hash(parsed.password, 10);
      }

      // Atualiza dados do barbeiro
      await tx.barber.update({
        where: { id: parsed.id },
        data: {
          name: parsed.name,
          email: parsed.email,
          phone: parsed.phone,
        },
      });

      // Se já tiver usuário ligado, atualiza
      if (barber.user) {
        await tx.user.update({
          where: { id: barber.user.id },
          data: {
            name: parsed.name,
            email: parsed.email,
            ...(passwordHash ? { passwordHash } : {}),
          },
        });
      } else if (passwordHash) {
        // Se não tiver usuário ainda, mas o admin definiu uma senha na edição,
        // cria o usuário e liga ao barbeiro.
        const user = await tx.user.create({
          data: {
            name: parsed.name,
            email: parsed.email,
            role: Role.BARBER,
            passwordHash,
          },
        });

        await tx.barber.update({
          where: { id: parsed.id },
          data: {
            userId: user.id,
          },
        });
      }
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      console.warn(
        "[updateBarber] E-mail já cadastrado em User ou Barber:",
        parsed.email,
      );
      return { error: "Já existe um usuário/barbeiro com este e-mail." };
    }

    console.error("[updateBarber] Erro inesperado:", err);
    return { error: "Erro ao atualizar barbeiro." };
  }

  revalidatePath("/admin/barber");
  redirect("/admin/barber");
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
