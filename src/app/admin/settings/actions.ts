"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";

type ActionResult = { ok: true } | { ok: false; error: string };

const createAdminSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().optional().nullable(),
  birthday: z.string().optional().nullable(), // dd/MM/yyyy ou vazio
  password: z.string().min(6, "Senha muito curta").optional().nullable(),
});

const updateAdminSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().optional().nullable(),
  birthday: z.string().optional().nullable(),
});

const permissionsSchema = z.object({
  userId: z.string().min(1),
  canAccessDashboard: z.coerce.boolean().optional(),
  canAccessCheckout: z.coerce.boolean().optional(),
  canAccessAppointments: z.coerce.boolean().optional(),
  canAccessProfessionals: z.coerce.boolean().optional(),
  canAccessServices: z.coerce.boolean().optional(),
  canAccessReviews: z.coerce.boolean().optional(),
  canAccessProducts: z.coerce.boolean().optional(),
  canAccessClients: z.coerce.boolean().optional(),
  canAccessFinance: z.coerce.boolean().optional(),
});

function normalizeOptionalText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

function normalizeBirthday(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;

  // yyyy-mm-dd (input type="date")
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }

  // dd/MM/yyyy
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
    const [dd, mm, yyyy] = v.split("/");
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function firstZodErrorMessage(err: z.ZodError): string {
  const flat = err.flatten();
  const fieldErrors = Object.values(flat.fieldErrors).flat().filter(Boolean);
  return fieldErrors[0] ?? "Dados inválidos";
}

/* ===========================
 * CREATE ADMIN
 * =========================== */
export async function createAdminAction(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createAdminSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    birthday: formData.get("birthday"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    console.error("[createAdminAction] Validação:", parsed.error.flatten());
    return { ok: false, error: firstZodErrorMessage(parsed.error) };
  }

  const name = String(parsed.data.name).trim();
  const email = String(parsed.data.email).trim().toLowerCase();
  const phone = normalizeOptionalText(parsed.data.phone);
  const birthday = normalizeBirthday(parsed.data.birthday);

  try {
    await prisma.user.create({
      data: {
        name,
        email,
        phone,
        birthday: birthday ?? undefined,
        role: "ADMIN",
        isActive: true,
        isOwner: false,
        adminAccess: {
          create: {
            canAccessDashboard: false,
            canAccessCheckout: false,
            canAccessAppointments: false,
            canAccessProfessionals: false,
            canAccessServices: false,
            canAccessReviews: false,
            canAccessProducts: false,
            canAccessClients: false,
            canAccessFinance: false,
          },
        },
      },
      select: { id: true },
    });

    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      console.warn("[createAdminAction] Email já existe:", err.meta);
      return { ok: false, error: "Já existe um usuário com esse e-mail." };
    }
    console.error("[createAdminAction] Erro:", err);
    return { ok: false, error: "Erro ao criar admin. Tente novamente." };
  }
}

/* ===========================
 * UPDATE ADMIN
 * =========================== */
export async function updateAdminAction(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateAdminSchema.safeParse({
    userId: formData.get("userId"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    birthday: formData.get("birthday"),
  });

  if (!parsed.success) {
    console.error("[updateAdminAction] Validação:", parsed.error.flatten());
    return { ok: false, error: firstZodErrorMessage(parsed.error) };
  }

  const userId = parsed.data.userId;
  const name = String(parsed.data.name).trim();
  const email = String(parsed.data.email).trim().toLowerCase();
  const phone = normalizeOptionalText(parsed.data.phone);
  const birthday = normalizeBirthday(parsed.data.birthday);

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        email,
        phone,
        birthday: birthday ?? null,
      },
      select: { id: true },
    });

    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      console.warn("[updateAdminAction] Email já existe:", err.meta);
      return { ok: false, error: "Já existe um usuário com esse e-mail." };
    }
    console.error("[updateAdminAction] Erro:", err);
    return { ok: false, error: "Erro ao atualizar admin. Tente novamente." };
  }
}

/* ===========================
 * UPDATE ADMIN PERMISSIONS
 * =========================== */
export async function updateAdminPermissions(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = permissionsSchema.safeParse({
    userId: formData.get("userId"),
    canAccessDashboard: formData.get("canAccessDashboard"),
    canAccessCheckout: formData.get("canAccessCheckout"),
    canAccessAppointments: formData.get("canAccessAppointments"),
    canAccessProfessionals: formData.get("canAccessProfessionals"),
    canAccessServices: formData.get("canAccessServices"),
    canAccessReviews: formData.get("canAccessReviews"),
    canAccessProducts: formData.get("canAccessProducts"),
    canAccessClients: formData.get("canAccessClients"),
    canAccessFinance: formData.get("canAccessFinance"),
  });

  if (!parsed.success) {
    console.error(
      "[updateAdminPermissions] Validação:",
      parsed.error.flatten(),
    );
    return { ok: false, error: firstZodErrorMessage(parsed.error) };
  }

  const p = parsed.data;

  try {
    await prisma.adminAccess.upsert({
      where: { userId: p.userId },
      update: {
        canAccessDashboard: !!p.canAccessDashboard,
        canAccessCheckout: !!p.canAccessCheckout,
        canAccessAppointments: !!p.canAccessAppointments,
        canAccessProfessionals: !!p.canAccessProfessionals,
        canAccessServices: !!p.canAccessServices,
        canAccessReviews: !!p.canAccessReviews,
        canAccessProducts: !!p.canAccessProducts,
        canAccessClients: !!p.canAccessClients,
        canAccessFinance: !!p.canAccessFinance,
      },
      create: {
        userId: p.userId,
        canAccessDashboard: !!p.canAccessDashboard,
        canAccessCheckout: !!p.canAccessCheckout,
        canAccessAppointments: !!p.canAccessAppointments,
        canAccessProfessionals: !!p.canAccessProfessionals,
        canAccessServices: !!p.canAccessServices,
        canAccessReviews: !!p.canAccessReviews,
        canAccessProducts: !!p.canAccessProducts,
        canAccessClients: !!p.canAccessClients,
        canAccessFinance: !!p.canAccessFinance,
      },
      select: { id: true },
    });

    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (err) {
    console.error("[updateAdminPermissions] Erro:", err);
    return { ok: false, error: "Erro ao salvar permissões." };
  }
}

/* ===========================
 * TOGGLE ADMIN STATUS
 * =========================== */
export async function toggleAdminStatusAction(
  formData: FormData,
): Promise<ActionResult> {
  const userId = String(formData.get("userId") || "");
  if (!userId) return { ok: false, error: "Usuário inválido." };

  try {
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true, isOwner: true, role: true },
    });

    if (!current) return { ok: false, error: "Usuário não encontrado." };

    // Dono não desativa
    if (current.isOwner)
      return { ok: false, error: "Não é possível desativar o admin dono." };

    // Só admin
    if (current.role !== "ADMIN")
      return { ok: false, error: "Apenas usuários ADMIN podem ser alterados." };

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: !current.isActive },
      select: { id: true },
    });

    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (err) {
    console.error("[toggleAdminStatusAction] Erro:", err);
    return { ok: false, error: "Erro ao alternar status do admin." };
  }
}
