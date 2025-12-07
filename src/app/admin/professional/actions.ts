// app/admin/professional/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const imageUrlSchema = z
  .union([z.string().url("URL da imagem inválida"), z.literal(""), z.null()])
  .optional();

const createBarberSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().optional(),
  password: z.string().min(5, "Senha deve ter pelo menos 5 caracteres"),
  // 🔹 vamos usar esse valor para User.image
  imageUrl: imageUrlSchema,
});

const updateBarberSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().optional(),
  // senha opcional na edição
  password: z.string().optional(),
  imageUrl: imageUrlSchema,
});

function normalizeImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed;
}

export async function createBarber(formData: FormData): Promise<void> {
  const result = createBarberSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    password: formData.get("password"),
    imageUrl: formData.get("imageUrl"),
  });

  if (!result.success) {
    console.error("[createBarber] Erro de validação:", result.error.flatten());
    // não retorna objeto, só encerra
    return;
  }

  const parsed = result.data;
  const normalizedImageUrl = normalizeImageUrl(
    parsed.imageUrl as string | null | undefined,
  );

  try {
    await prisma.$transaction(async (tx) => {
      const passwordHash = await bcrypt.hash(parsed.password, 10);

      // 1) Cria o usuário que vai logar no painel (com foto)
      const user = await tx.user.create({
        data: {
          name: parsed.name,
          email: parsed.email,
          role: Role.BARBER,
          passwordHash,
          image: normalizedImageUrl,
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
      console.warn(
        "[createBarber] E-mail já cadastrado em User ou Barber:",
        parsed.email,
      );
      // sem retorno de objeto, só log
      return;
    }

    console.error("[createBarber] Erro inesperado:", err);
    return;
  }

  revalidatePath("/admin/professional");
  redirect("/admin/professional");
}

export async function updateBarber(formData: FormData): Promise<void> {
  const rawPassword = (formData.get("password") || "") as string;

  const result = updateBarberSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    // se vier string vazia, trata como undefined
    password: rawPassword.trim() === "" ? undefined : rawPassword,
    imageUrl: formData.get("imageUrl"),
  });

  if (!result.success) {
    console.error("[updateBarber] Erro de validação:", result.error.flatten());
    return;
  }

  const parsed = result.data;
  const normalizedImageUrl = normalizeImageUrl(
    parsed.imageUrl as string | null | undefined,
  );

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

      // Se já tiver usuário ligado, atualiza (incluindo foto)
      if (barber.user) {
        await tx.user.update({
          where: { id: barber.user.id },
          data: {
            name: parsed.name,
            email: parsed.email,
            ...(passwordHash ? { passwordHash } : {}),
            image: normalizedImageUrl,
          },
        });
      } else if (passwordHash) {
        // Se não tiver usuário ainda, mas o admin definiu uma senha na edição,
        // cria o usuário e liga ao barbeiro (já com foto).
        const user = await tx.user.create({
          data: {
            name: parsed.name,
            email: parsed.email,
            role: Role.BARBER,
            passwordHash,
            image: normalizedImageUrl,
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
      return;
    }

    console.error("[updateBarber] Erro inesperado:", err);
    return;
  }

  revalidatePath("/admin/professional");
  redirect("/admin/professional");
}

export async function toggleBarberStatus(formData: FormData): Promise<void> {
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

  revalidatePath("/admin/professional");
}
