// app/admin/settings/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { validatePassword } from "@/lib/password-policy";
import { requireAdminForModule } from "@/lib/admin-permissions";

type ActionResult = { ok: true } | { ok: false; error: string };

const createAdminSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),

  // ✅ obrigatório para separar visões por unidade
  unitId: z.string().min(1, "Unidade obrigatória"),

  phone: z.string().optional().nullable(),
  birthday: z.string().optional().nullable(), // dd/MM/yyyy ou yyyy-mm-dd

  // ✅ senha obrigatória (validação forte feita no server via validatePassword)
  password: z.string().min(1, "Senha obrigatória"),
});

const updateAdminSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().optional().nullable(),
  birthday: z.string().optional().nullable(),

  // ✅ se vier preenchida, troca senha (validação forte no server)
  password: z.string().optional().nullable(),
});

const permissionsSchema = z.object({
  userId: z.string().min(1),
  canAccessDashboard: z.coerce.boolean().optional(),

  // ✅ NOVO: Relatórios
  canAccessReports: z.coerce.boolean().optional(),

  canAccessCheckout: z.coerce.boolean().optional(),
  canAccessAppointments: z.coerce.boolean().optional(),
  canAccessProfessionals: z.coerce.boolean().optional(),
  canAccessServices: z.coerce.boolean().optional(),
  canAccessReviews: z.coerce.boolean().optional(),
  canAccessProducts: z.coerce.boolean().optional(),
  canAccessClients: z.coerce.boolean().optional(),
  canAccessClientLevels: z.coerce.boolean().optional(),
  canAccessFinance: z.coerce.boolean().optional(),
});

/* =========================================================
 * Helpers
 * =======================================================*/

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

/**
 * ✅ Helper tipado corretamente
 * Evita TS2322 e sempre retorna string
 */
function firstZodErrorMessage(err: z.ZodError): string {
  const flat = err.flatten();

  const formError = flat.formErrors.find(
    (m): m is string => typeof m === "string" && m.trim().length > 0,
  );
  if (formError) return formError;

  const fieldError = Object.values(flat.fieldErrors)
    .flatMap((arr) => (Array.isArray(arr) ? arr : []))
    .find((m): m is string => typeof m === "string" && m.trim().length > 0);

  return fieldError ?? "Dados inválidos";
}

function looksLikeUnknownFieldError(err: unknown, field: string) {
  const msg = String((err as any)?.message ?? "");
  return msg.includes("Unknown arg") && msg.includes(`\`${field}\``);
}

async function hashPassword(raw: string) {
  return bcrypt.hash(raw, 12);
}

async function assertUnitBelongsToCompany(unitId: string, companyId: string) {
  const unit = await prisma.unit.findFirst({
    where: { id: unitId, companyId },
    select: { id: true, isActive: true },
  });
  if (!unit) return null;
  return unit;
}

async function assertUserIsAdminMemberOfCompany(
  userId: string,
  companyId: string,
) {
  const member = await prisma.companyMember.findFirst({
    where: {
      companyId,
      userId,
      isActive: true,
      role: { in: ["OWNER", "ADMIN"] },
    },
    select: { id: true, role: true },
  });
  return member;
}

/* =========================================================
 * CREATE ADMIN (multi-tenant)
 * =======================================================*/

export async function createAdminAction(
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdminForModule("SETTINGS");
  const companyId = admin.companyId;

  // (opcional) só OWNER cria admin
  // se você quiser liberar ADMIN também, remove esse if.
  if (!admin.isOwner) {
    return { ok: false, error: "Apenas o dono pode criar administradores." };
  }

  const parsed = createAdminSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    unitId: formData.get("unitId"),
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
  const unitId = String(parsed.data.unitId).trim();

  const phone = normalizeOptionalText(parsed.data.phone);
  const birthday = normalizeBirthday(parsed.data.birthday);

  const password = String(parsed.data.password ?? "");
  const passCheck = validatePassword(password);
  if (!passCheck.ok) {
    return { ok: false, error: passCheck.errors[0] ?? "Senha inválida." };
  }

  try {
    // ✅ unidade deve ser da empresa atual
    const unit = await assertUnitBelongsToCompany(unitId, companyId);
    if (!unit) return { ok: false, error: "Unidade não encontrada." };

    const passwordHash = await hashPassword(password);

    await prisma.$transaction(async (tx) => {
      // 1) cria o usuário global (role ADMIN por compatibilidade)
      const createdUser = await tx.user.create({
        data: {
          name,
          email,
          phone,
          birthday: birthday ?? undefined,
          role: "ADMIN",
          isActive: true,
          isOwner: false,
          passwordHash,
        } as any,
        select: { id: true },
      });

      // 2) cria membership dessa company (admin "real" no multi-tenant)
      await tx.companyMember.create({
        data: {
          companyId,
          userId: createdUser.id,
          role: "ADMIN",
          isActive: true,
          lastUnitId: unitId,
        },
        select: { id: true },
      });

      // 3) cria/upsert AdminAccess (multi-tenant exige companyId)
      const baseAccess = {
        canAccessDashboard: false,
        canAccessReports: false, // ✅ NOVO

        canAccessCheckout: false,
        canAccessAppointments: false,
        canAccessProfessionals: false,
        canAccessServices: false,
        canAccessReviews: false,
        canAccessProducts: false,
        canAccessClients: false,
        canAccessClientLevels: false,
        canAccessFinance: false,
      };

      try {
        await tx.adminAccess.upsert({
          where: {
            companyId_userId: { companyId, userId: createdUser.id },
          },
          update: {
            ...baseAccess,
            unitId: unitId || null,
          } as any,
          create: {
            companyId,
            userId: createdUser.id,
            unitId: unitId || null,
            ...baseAccess,
          } as any,
          select: { id: true },
        });
      } catch (err) {
        // fallback se por algum motivo o schema ainda não tem unitId em AdminAccess
        if (!looksLikeUnknownFieldError(err, "unitId")) throw err;

        await tx.adminAccess.upsert({
          where: {
            companyId_userId: { companyId, userId: createdUser.id },
          },
          update: { ...baseAccess } as any,
          create: {
            companyId,
            userId: createdUser.id,
            ...baseAccess,
          } as any,
          select: { id: true },
        });
      }
    });

    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return { ok: false, error: "Já existe um usuário com esse e-mail." };
    }

    console.error("[createAdminAction] Erro:", err);
    return { ok: false, error: "Erro ao criar admin. Tente novamente." };
  }
}

/* =========================================================
 * UPDATE ADMIN (multi-tenant)
 * =======================================================*/

export async function updateAdminAction(
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdminForModule("SETTINGS");
  const companyId = admin.companyId;

  const parsed = updateAdminSchema.safeParse({
    userId: formData.get("userId"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    birthday: formData.get("birthday"),
    password: formData.get("password"),
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

  const maybePasswordRaw =
    typeof parsed.data.password === "string" ? parsed.data.password : "";
  const passwordToSet = maybePasswordRaw.trim();

  try {
    // ✅ só edita admin que é membro dessa company
    const member = await assertUserIsAdminMemberOfCompany(userId, companyId);
    if (!member) {
      return { ok: false, error: "Administrador não pertence a esta empresa." };
    }

    // (opcional) só OWNER pode editar outros admins
    if (!admin.isOwner && admin.id !== userId) {
      return { ok: false, error: "Sem permissão para editar este admin." };
    }

    const dataToUpdate: any = {
      name,
      email,
      phone,
      birthday: birthday ?? null,
    };

    if (passwordToSet) {
      const passCheck = validatePassword(passwordToSet);
      if (!passCheck.ok) {
        return { ok: false, error: passCheck.errors[0] ?? "Senha inválida." };
      }
      dataToUpdate.passwordHash = await hashPassword(passwordToSet);
    }

    await prisma.user.update({
      where: { id: userId },
      data: dataToUpdate,
      select: { id: true },
    });

    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return { ok: false, error: "Já existe um usuário com esse e-mail." };
    }

    console.error("[updateAdminAction] Erro:", err);
    return { ok: false, error: "Erro ao atualizar admin. Tente novamente." };
  }
}

/* =========================================================
 * UPDATE ADMIN PERMISSIONS (multi-tenant)
 * =======================================================*/

export async function updateAdminPermissions(
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdminForModule("SETTINGS");
  const companyId = admin.companyId;

  // (opcional) só OWNER muda permissões
  if (!admin.isOwner) {
    return { ok: false, error: "Apenas o dono pode alterar permissões." };
  }

  const parsed = permissionsSchema.safeParse({
    userId: formData.get("userId"),
    canAccessDashboard: formData.get("canAccessDashboard"),

    // ✅ NOVO: Relatórios
    canAccessReports: formData.get("canAccessReports"),

    canAccessCheckout: formData.get("canAccessCheckout"),
    canAccessAppointments: formData.get("canAccessAppointments"),
    canAccessProfessionals: formData.get("canAccessProfessionals"),
    canAccessServices: formData.get("canAccessServices"),
    canAccessReviews: formData.get("canAccessReviews"),
    canAccessProducts: formData.get("canAccessProducts"),
    canAccessClients: formData.get("canAccessClients"),
    canAccessClientLevels: formData.get("canAccessClientLevels"),
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
    // ✅ garante que o alvo é membro admin/owner dessa company
    const member = await assertUserIsAdminMemberOfCompany(p.userId, companyId);
    if (!member) {
      return { ok: false, error: "Administrador não pertence a esta empresa." };
    }

    // se for OWNER, você pode decidir travar permissões (opcional)
    // if (member.role === "OWNER") return { ok:false, error:"Não é possível alterar permissões do dono." }

    const updatePayload: any = {
      canAccessDashboard: !!p.canAccessDashboard,
      canAccessReports: !!p.canAccessReports, // ✅ NOVO

      canAccessCheckout: !!p.canAccessCheckout,
      canAccessAppointments: !!p.canAccessAppointments,
      canAccessProfessionals: !!p.canAccessProfessionals,
      canAccessServices: !!p.canAccessServices,
      canAccessReviews: !!p.canAccessReviews,
      canAccessProducts: !!p.canAccessProducts,
      canAccessClients: !!p.canAccessClients,
      canAccessFinance: !!p.canAccessFinance,
    };

    // tenta incluir client levels se existir
    if (p.canAccessClientLevels !== undefined) {
      updatePayload.canAccessClientLevels = !!p.canAccessClientLevels;
    }

    try {
      await prisma.adminAccess.upsert({
        where: {
          companyId_userId: { companyId, userId: p.userId },
        },
        update: updatePayload,
        create: {
          companyId,
          userId: p.userId,
          unitId: null,
          ...updatePayload,
          // se não veio canAccessClientLevels no schema, cai no fallback
        } as any,
        select: { id: true },
      });
    } catch (err) {
      // fallback sem canAccessClientLevels (se o schema antigo ainda existir)
      if (!looksLikeUnknownFieldError(err, "canAccessClientLevels")) throw err;

      const { canAccessClientLevels, ...rest } = updatePayload;

      await prisma.adminAccess.upsert({
        where: {
          companyId_userId: { companyId, userId: p.userId },
        },
        update: rest,
        create: {
          companyId,
          userId: p.userId,
          unitId: null,
          ...rest,
        } as any,
        select: { id: true },
      });
    }

    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (err) {
    console.error("[updateAdminPermissions] Erro:", err);
    return { ok: false, error: "Erro ao salvar permissões." };
  }
}

/* =========================================================
 * TOGGLE ADMIN STATUS (multi-tenant)
 * =======================================================*/

export async function toggleAdminStatusAction(
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdminForModule("SETTINGS");
  const companyId = admin.companyId;

  // (opcional) só OWNER desativa admin
  if (!admin.isOwner) {
    return { ok: false, error: "Apenas o dono pode alterar o status." };
  }

  const userId = String(formData.get("userId") || "");
  if (!userId) return { ok: false, error: "Usuário inválido." };

  try {
    // ✅ só mexe em admin que é membro dessa company
    const member = await assertUserIsAdminMemberOfCompany(userId, companyId);
    if (!member) {
      return { ok: false, error: "Administrador não pertence a esta empresa." };
    }

    // não desativa OWNER
    if (member.role === "OWNER") {
      return { ok: false, error: "Não é possível desativar o admin dono." };
    }

    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true, role: true },
    });

    if (!current) return { ok: false, error: "Usuário não encontrado." };

    if (current.role !== "ADMIN") {
      return { ok: false, error: "Apenas usuários ADMIN podem ser alterados." };
    }

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
