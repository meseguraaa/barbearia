// app/admin/clients/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import z from "zod";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

const COMPANY_COOKIE_NAME = "admin_company_context";
const SESSION_COOKIE_NAME = "painel_session";

/* ---------------------------------------------------------
 * JWT helpers (painel_session)
 * ---------------------------------------------------------*/
function getJwtSecretKey() {
  const secret = process.env.PAINEL_JWT_SECRET;
  if (!secret) {
    throw new Error("PAINEL_JWT_SECRET não definido no .env");
  }
  return new TextEncoder().encode(secret);
}

async function getAdminUserIdFromPainelSessionCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    const sub = String((payload as any)?.sub ?? "").trim();
    return sub.length ? sub : null;
  } catch {
    return null;
  }
}

/**
 * ✅ companyId no Admin:
 * 1) cookie admin_company_context
 * 2) decode do cookie painel_session -> payload.sub (userId)
 * 3) primeira membership ativa no banco (company_members)
 */
async function requireCompanyId() {
  const cookieStore = await cookies();
  const cookieCompanyId = cookieStore.get(COMPANY_COOKIE_NAME)?.value;
  if (cookieCompanyId) return cookieCompanyId;

  const userId = await getAdminUserIdFromPainelSessionCookie();
  if (userId) {
    const membership = await prisma.companyMember.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { companyId: true },
    });

    if (membership?.companyId) return membership.companyId;
  }

  throw new Error(
    `companyId ausente (cookie "${COMPANY_COOKIE_NAME}" e sem fallback via "${SESSION_COOKIE_NAME}"). Selecione uma empresa no contexto do admin.`,
  );
}

/* ---------------------------------------------------------
 * Schemas
 * ---------------------------------------------------------*/
const createClientSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().min(1, "Telefone é obrigatório"),
  birthday: z.string().optional().nullable(), // "DD/MM/AAAA" ou "yyyy-MM-dd"
});

const updateClientSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().min(1, "Telefone é obrigatório"),
  birthday: z.string().nullable().optional(), // "DD/MM/AAAA" ou "yyyy-MM-dd"
});

/* ---------------------------------------------------------
 * Utils
 * ---------------------------------------------------------*/
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
  const companyId = await requireCompanyId();

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

  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone.length !== 11) {
    return { error: "Informe um telefone válido com DDD (11 dígitos)." };
  }

  const birthdayDate = parseBirthdayToDate(birthday ?? null);
  if (birthday != null && birthday !== "" && !birthdayDate) {
    return { error: "Data de nascimento inválida." };
  }

  try {
    // ✅ User NÃO tem companyId -> cria user e cria membership na company_members
    await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          email,
          phone: normalizedPhone,
          birthday: birthdayDate,
          role: "CLIENT",
        },
        select: { id: true },
      });

      await tx.companyMember.create({
        data: {
          userId: created.id,
          companyId,
          role: "CLIENT",
          isActive: true,
        },
      });
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
  const companyId = await requireCompanyId();

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
    // ✅ garante que esse user pertence à empresa via membership
    const membership = await prisma.companyMember.findFirst({
      where: {
        userId: id,
        companyId,
        isActive: true,
        role: "CLIENT",
      },
      select: { id: true },
    });

    if (!membership) {
      return { error: "Cliente não encontrado para esta empresa." };
    }

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
