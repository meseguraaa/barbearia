// app/admin/settings/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import z from "zod";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import bcrypt from "bcryptjs";

const createAdminSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().min(1, "Telefone é obrigatório"),
  birthday: z.string().min(1, "Data de nascimento é obrigatória"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

const updateAdminSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().min(1, "Telefone é obrigatório"),
  birthday: z.string().nullable().optional(),
  // senha opcional – se vier vazia, não troca
  password: z.string().optional(),
});

function parseBirthdayToDate(birthday: string | null | undefined): Date | null {
  if (!birthday) return null;

  const trimmed = birthday.trim();
  if (!trimmed) return null;

  try {
    if (trimmed.includes("-")) {
      // yyyy-MM-dd
      const [year, month, day] = trimmed.split("-");
      return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0);
    }

    if (trimmed.includes("/")) {
      // dd/MM/yyyy
      const [day, month, year] = trimmed.split("/");
      return new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0);
    }
  } catch (e) {
    console.error("Erro ao converter data de nascimento (admin):", e);
  }

  return null;
}

/* =======================================================
 * AUTH DO PAINEL (pega admin logado via cookie painel_session)
 * =======================================================
 */
const SESSION_COOKIE_NAME = "painel_session";

type PainelSessionPayload = {
  sub: string;
  role: "CLIENT" | "BARBER" | "ADMIN";
  email: string;
  name?: string | null;
};

function getJwtSecretKey() {
  const secret = process.env.PAINEL_JWT_SECRET;
  if (!secret) {
    throw new Error("PAINEL_JWT_SECRET não definido no .env");
  }
  return new TextEncoder().encode(secret);
}

async function getCurrentAdminUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    const sessionPayload = payload as unknown as PainelSessionPayload;

    if (sessionPayload.role !== "ADMIN") return null;

    const admin = await prisma.user.findUnique({
      where: { id: sessionPayload.sub },
    });

    return admin;
  } catch (e) {
    console.error("Erro ao validar sessão do painel:", e);
    return null;
  }
}

/* =======================================================
 * CRIAR ADMIN (APENAS DONO)
 * =======================================================
 */
export async function createAdminAction(
  formData: FormData,
): Promise<{ error?: string; success?: true }> {
  const currentAdmin = await getCurrentAdminUser();

  if (!currentAdmin || !(currentAdmin as any).isOwner) {
    return { error: "Apenas o dono pode criar novos administradores." };
  }

  const raw = {
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    birthday: formData.get("birthday"),
    password: formData.get("password"),
  };

  const parsed = createAdminSchema.safeParse({
    name: String(raw.name ?? ""),
    email: String(raw.email ?? ""),
    phone: String(raw.phone ?? ""),
    birthday: String(raw.birthday ?? ""),
    password: String(raw.password ?? ""),
  });

  if (!parsed.success) {
    console.error(parsed.error.flatten().fieldErrors);
    return { error: "Dados inválidos ao criar administrador." };
  }

  const { name, email, phone, birthday, password } = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    return { error: "Já existe um usuário cadastrado com esse e-mail." };
  }

  const birthdayDate = parseBirthdayToDate(birthday);
  const passwordHash = await bcrypt.hash(password, 10); // ajuste o campo abaixo conforme seu schema

  await prisma.user.create({
    data: {
      name,
      email,
      phone,
      birthday: birthdayDate,
      role: "ADMIN",
      isOwner: false,
      isActive: true,
      passwordHash, // se no seu schema for outro nome, troca aqui
    },
  });

  revalidatePath("/admin/settings");

  return { success: true };
}

/* =======================================================
 * EDITAR ADMIN (APENAS DONO)
 * =======================================================
 */
export async function updateAdminAction(
  formData: FormData,
): Promise<{ error?: string; success?: true }> {
  const currentAdmin = await getCurrentAdminUser();

  if (!currentAdmin || !(currentAdmin as any).isOwner) {
    return { error: "Apenas o dono pode editar administradores." };
  }

  const raw = {
    id: formData.get("id"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    birthday: formData.get("birthday"),
    password: formData.get("password"),
  };

  const parsed = updateAdminSchema.safeParse({
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    email: String(raw.email ?? ""),
    phone: String(raw.phone ?? ""),
    birthday:
      raw.birthday != null && raw.birthday !== "" ? String(raw.birthday) : null,
    password:
      raw.password != null && String(raw.password).trim() !== ""
        ? String(raw.password)
        : undefined,
  });

  if (!parsed.success) {
    console.error(parsed.error.flatten().fieldErrors);
    return { error: "Dados inválidos ao atualizar administrador." };
  }

  const { id, name, email, phone, birthday, password } = parsed.data;

  const birthdayDate = parseBirthdayToDate(birthday ?? null);

  const dataToUpdate: any = {
    name,
    email,
    phone,
    birthday: birthdayDate,
  };

  if (password) {
    dataToUpdate.passwordHash = await bcrypt.hash(password, 10);
  }

  await prisma.user.update({
    where: { id },
    data: dataToUpdate,
  });

  revalidatePath("/admin/settings");

  return { success: true };
}

/* =======================================================
 * ATIVAR / INATIVAR ADMIN (APENAS DONO)
 * =======================================================
 */
export async function toggleAdminStatusAction(
  formData: FormData,
): Promise<{ error?: string; success?: true }> {
  const currentAdmin = await getCurrentAdminUser();

  if (!currentAdmin || !(currentAdmin as any).isOwner) {
    return { error: "Apenas o dono pode ativar ou inativar administradores." };
  }

  const userId = formData.get("userId") as string | null;
  if (!userId) {
    return { error: "Administrador inválido." };
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!target) {
    return { error: "Administrador não encontrado." };
  }

  if ((target as any).isOwner) {
    return { error: "Não é possível inativar o administrador dono." };
  }

  const isActive = (target as any).isActive ?? true;

  await prisma.user.update({
    where: { id: userId },
    data: {
      isActive: !isActive,
    },
  });

  revalidatePath("/admin/settings");

  return { success: true };
}

/* =======================================================
 * ATUALIZAR PERMISSÕES
 * =======================================================
 */
export async function updateAdminPermissions(
  formData: FormData,
): Promise<void> {
  const userId = formData.get("userId") as string | null;
  if (!userId) {
    return;
  }

  const canAccessDashboard = formData.get("canAccessDashboard") === "on";
  const canAccessCheckout = formData.get("canAccessCheckout") === "on";
  const canAccessAppointments = formData.get("canAccessAppointments") === "on";
  const canAccessProfessionals =
    formData.get("canAccessProfessionals") === "on";
  const canAccessServices = formData.get("canAccessServices") === "on";
  const canAccessReviews = formData.get("canAccessReviews") === "on";
  const canAccessProducts = formData.get("canAccessProducts") === "on";
  const canAccessClients = formData.get("canAccessClients") === "on";
  const canAccessFinance = formData.get("canAccessFinance") === "on";

  await prisma.adminAccess.upsert({
    where: { userId },
    update: {
      canAccessDashboard,
      canAccessCheckout,
      canAccessAppointments,
      canAccessProfessionals,
      canAccessServices,
      canAccessReviews,
      canAccessProducts,
      canAccessClients,
      canAccessFinance,
    },
    create: {
      userId,
      canAccessDashboard,
      canAccessCheckout,
      canAccessAppointments,
      canAccessProfessionals,
      canAccessServices,
      canAccessReviews,
      canAccessProducts,
      canAccessClients,
      canAccessFinance,
    },
  });

  revalidatePath("/admin/settings");
}
