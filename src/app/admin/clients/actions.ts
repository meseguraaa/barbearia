"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import z from "zod";

const createClientSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().min(1, "Telefone é obrigatório"),
  // ✅ no "Novo Cliente" você ainda não coleta birthday,
  // então não pode ser obrigatório aqui
  birthday: z.string().optional().nullable(), // "DD/MM/AAAA" ou "yyyy-MM-dd"
});

const updateClientSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().min(1, "Telefone é obrigatório"),
  birthday: z.string().nullable().optional(), // "DD/MM/AAAA" ou "yyyy-MM-dd"
});

function normalizePhone(phone: string): string {
  return String(phone ?? "").replace(/\D/g, "");
}

function isValidDate(d: Date) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

function parseBirthdayToDate(birthday: string | null | undefined): Date | null {
  if (!birthday) return null;

  const trimmed = birthday.trim();
  if (!trimmed) return null;

  try {
    if (trimmed.includes("-")) {
      // yyyy-MM-dd
      const [year, month, day] = trimmed.split("-");
      const y = Number(year);
      const m = Number(month);
      const d = Number(day);

      const date = new Date(y, m - 1, d, 0, 0, 0);

      const ok =
        isValidDate(date) &&
        date.getFullYear() === y &&
        date.getMonth() === m - 1 &&
        date.getDate() === d;

      return ok ? date : null;
    }

    if (trimmed.includes("/")) {
      // dd/MM/yyyy
      const [day, month, year] = trimmed.split("/");
      const d = Number(day);
      const m = Number(month);
      const y = Number(year);

      const date = new Date(y, m - 1, d, 0, 0, 0);

      const ok =
        isValidDate(date) &&
        date.getFullYear() === y &&
        date.getMonth() === m - 1 &&
        date.getDate() === d;

      return ok ? date : null;
    }
  } catch (e) {
    console.error("Erro ao converter data de nascimento:", e);
  }

  return null;
}

function revalidateClientsRelated() {
  revalidatePath("/admin/clients");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/checkout");
}

/* =======================================================
 * CRIAR CLIENTE
 * ======================================================= */
export async function createClientAction(
  formData: FormData,
): Promise<{ error?: string; success?: true }> {
  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    birthday: formData.get("birthday"),
  };

  const parsed = createClientSchema.safeParse({
    name: String(raw.name ?? "").trim(),
    email: String(raw.email ?? "")
      .trim()
      .toLowerCase(),
    phone: String(raw.phone ?? "").trim(),
    birthday:
      raw.birthday != null && String(raw.birthday).trim() !== ""
        ? String(raw.birthday).trim()
        : null,
  });

  if (!parsed.success) {
    console.error(parsed.error.flatten().fieldErrors);
    return { error: "Dados inválidos ao criar cliente." };
  }

  const { name, email, phone, birthday } = parsed.data;

  // 🔒 telefone obrigatório de verdade: 11 dígitos (DDD + 9)
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone.length !== 11) {
    return { error: "Informe um telefone válido com DDD (11 dígitos)." };
  }

  const birthdayDate = parseBirthdayToDate(birthday ?? null);
  if (birthday != null && birthday !== "" && !birthdayDate) {
    return { error: "Data de nascimento inválida." };
  }

  try {
    await prisma.user.create({
      data: {
        name,
        email,
        phone: normalizedPhone,
        birthday: birthdayDate, // pode ser null
        role: "CLIENT",
      },
    });
  } catch (err: any) {
    const message = String(err?.message ?? "");
    if (message.toLowerCase().includes("unique") || message.includes("P2002")) {
      return { error: "Já existe um cliente cadastrado com esse e-mail." };
    }
    console.error("Erro ao criar cliente:", err);
    return { error: "Erro ao criar cliente. Tente novamente." };
  }

  revalidateClientsRelated();
  return { success: true };
}

/* =======================================================
 * EDITAR CLIENTE
 * ======================================================= */
export async function updateClientAction(
  formData: FormData,
): Promise<{ error?: string; success?: true }> {
  const raw = {
    id: formData.get("id"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    birthday: formData.get("birthday"),
  };

  const parsed = updateClientSchema.safeParse({
    id: String(raw.id ?? "").trim(),
    name: String(raw.name ?? "").trim(),
    email: String(raw.email ?? "")
      .trim()
      .toLowerCase(),
    phone: String(raw.phone ?? "").trim(),
    birthday:
      raw.birthday != null && String(raw.birthday).trim() !== ""
        ? String(raw.birthday).trim()
        : null,
  });

  if (!parsed.success) {
    console.error(parsed.error.flatten().fieldErrors);
    return { error: "Dados inválidos ao atualizar cliente." };
  }

  const { id, name, email, phone, birthday } = parsed.data;

  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone.length !== 11) {
    return { error: "Informe um telefone válido com DDD (11 dígitos)." };
  }

  const birthdayDate = parseBirthdayToDate(birthday ?? null);
  if (birthday != null && birthday !== "" && !birthdayDate) {
    return { error: "Data de nascimento inválida." };
  }

  try {
    await prisma.user.update({
      where: { id },
      data: {
        name,
        email,
        phone: normalizedPhone,
        birthday: birthdayDate,
      },
    });
  } catch (err: any) {
    const message = String(err?.message ?? "");
    if (message.toLowerCase().includes("unique") || message.includes("P2002")) {
      return { error: "Já existe um usuário com esse e-mail." };
    }

    console.error("Erro ao atualizar cliente:", err);
    return { error: "Erro ao atualizar cliente. Tente novamente." };
  }

  revalidateClientsRelated();
  return { success: true };
}
