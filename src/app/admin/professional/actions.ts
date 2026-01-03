"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, Role, CompanyMemberRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { validatePassword } from "@/lib/password-policy";
import { getCurrentPainelUser } from "@/lib/painel-session";

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireCompanyId(): Promise<string> {
  const payload = await getCurrentPainelUser();
  if (!payload) throw new Error("Sessão ausente.");
  if (payload.role !== "ADMIN") throw new Error("Sem permissão.");
  if (!payload.companyId) throw new Error("missing_company");
  return String(payload.companyId);
}

const imageUrlSchema = z
  .union([z.string().url("URL da imagem inválida"), z.literal(""), z.null()])
  .optional();

function normalizeImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  return trimmed;
}

function normalizePhone(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const digits = String(raw).replace(/\D/g, "");
  return digits || undefined;
}

const createBarberSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().optional(),
  password: z.string().min(1, "Senha obrigatória"),
  imageUrl: imageUrlSchema,
  unitIds: z.array(z.string().min(1)).min(1, "Selecione ao menos 1 unidade"),
});

const updateBarberSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().optional(),
  password: z.string().optional(),
  imageUrl: imageUrlSchema,
  unitIds: z.array(z.string().min(1)).min(1, "Selecione ao menos 1 unidade"),
});

async function assertUnitsAreActive(
  tx: Prisma.TransactionClient,
  companyId: string,
  unitIds: string[],
) {
  if (!unitIds || unitIds.length === 0)
    throw new Error("Selecione ao menos 1 unidade.");

  const count = await tx.unit.count({
    where: { companyId, id: { in: unitIds }, isActive: true },
  });

  if (count !== unitIds.length) {
    throw new Error("Uma ou mais unidades são inválidas ou estão inativas.");
  }
}

async function assertBarberBelongsToCompany(
  tx: Prisma.TransactionClient,
  companyId: string,
  barberId: string,
) {
  const exists = await tx.barber.count({ where: { id: barberId, companyId } });
  if (!exists) throw new Error("Profissional não encontrado.");
}

async function syncBarberUnits(
  tx: Prisma.TransactionClient,
  companyId: string,
  barberId: string,
  unitIds: string[],
) {
  await tx.barberUnit.updateMany({
    where: { companyId, barberId, unitId: { notIn: unitIds } },
    data: { isActive: false },
  });

  await Promise.all(
    unitIds.map((unitId) =>
      tx.barberUnit.upsert({
        where: { barberId_unitId: { barberId, unitId } },
        update: { isActive: true },
        create: { companyId, barberId, unitId, isActive: true },
      }),
    ),
  );
}

async function ensureCompanyMembership(
  tx: Prisma.TransactionClient,
  params: { companyId: string; userId: string; role: CompanyMemberRole },
) {
  const { companyId, userId, role } = params;

  await tx.companyMember.upsert({
    where: { companyId_userId: { companyId, userId } },
    update: { role, isActive: true },
    create: { companyId, userId, role, isActive: true },
  });
}

export async function createBarber(formData: FormData): Promise<ActionResult> {
  const rawPassword = String(formData.get("password") ?? "");
  const companyId = await requireCompanyId();

  const result = createBarberSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: normalizePhone(formData.get("phone")),
    password: rawPassword,
    imageUrl: formData.get("imageUrl"),
    unitIds: formData.getAll("unitIds").map(String),
  });

  if (!result.success) {
    console.error("[createBarber] Erro de validação:", result.error.flatten());
    const msg =
      result.error.flatten().formErrors?.[0] ||
      Object.values(result.error.flatten().fieldErrors).flat().find(Boolean) ||
      "Dados inválidos.";
    return { ok: false, error: msg };
  }

  const parsed = result.data;
  const normalizedImageUrl = normalizeImageUrl(parsed.imageUrl as any);

  try {
    const passCheck = validatePassword(parsed.password);
    if (!passCheck.ok) {
      return { ok: false, error: passCheck.errors[0] ?? "Senha inválida." };
    }

    await prisma.$transaction(async (tx) => {
      await assertUnitsAreActive(tx, companyId, parsed.unitIds);

      const passwordHash = await bcrypt.hash(parsed.password, 12);

      // 1) User global: reusa ou cria
      let user = await tx.user.findUnique({
        where: { email: parsed.email },
        include: { barber: true },
      });

      if (!user) {
        user = await tx.user.create({
          data: {
            name: parsed.name,
            email: parsed.email,
            role: Role.BARBER,
            passwordHash,
            image: normalizedImageUrl,
            phone: parsed.phone,
            isActive: true,
          },
          include: { barber: true },
        });
      } else {
        // ✅ se esse user já está ligado a um Barber, não dá pra ligar em outro (Barber.userId é @unique)
        if (user.barber?.id) {
          throw new Error(
            "Este e-mail já está vinculado a um profissional. Edite o profissional existente.",
          );
        }

        await tx.user.update({
          where: { id: user.id },
          data: {
            name: parsed.name,
            phone: parsed.phone,
            image: normalizedImageUrl,
            isActive: true,
            role: Role.BARBER,
            passwordHash,
          },
        });
      }

      await ensureCompanyMembership(tx, {
        companyId,
        userId: user.id,
        role: CompanyMemberRole.STAFF,
      });

      const barber = await tx.barber.create({
        data: {
          companyId,
          name: parsed.name,
          email: parsed.email,
          phone: parsed.phone,
          userId: user.id,
          imageUrl: normalizedImageUrl,
          isActive: true,
        },
      });

      await tx.barberUnit.createMany({
        data: parsed.unitIds.map((unitId) => ({
          companyId,
          barberId: barber.id,
          unitId,
          isActive: true,
        })),
        skipDuplicates: true,
      });
    });

    revalidatePath("/admin/professional");
    return { ok: true };
  } catch (err: any) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return { ok: false, error: "Já existe um profissional com esse e-mail." };
    }

    if (err?.message) {
      console.error("[createBarber] Regra de negócio:", err.message);
      return { ok: false, error: String(err.message) };
    }

    console.error("[createBarber] Erro inesperado:", err);
    return { ok: false, error: "Erro ao criar profissional." };
  }
}

export async function updateBarber(formData: FormData): Promise<ActionResult> {
  const rawPassword = String(formData.get("password") ?? "");
  const companyId = await requireCompanyId();

  const result = updateBarberSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: normalizePhone(formData.get("phone")),
    password: rawPassword.trim() === "" ? undefined : rawPassword,
    imageUrl: formData.get("imageUrl"),
    unitIds: formData.getAll("unitIds").map(String),
  });

  if (!result.success) {
    console.error("[updateBarber] Erro de validação:", result.error.flatten());
    const msg =
      result.error.flatten().formErrors?.[0] ||
      Object.values(result.error.flatten().fieldErrors).flat().find(Boolean) ||
      "Dados inválidos.";
    return { ok: false, error: msg };
  }

  const parsed = result.data;
  const normalizedImageUrl = normalizeImageUrl(parsed.imageUrl as any);

  try {
    if (parsed.password) {
      const passCheck = validatePassword(parsed.password);
      if (!passCheck.ok) {
        return { ok: false, error: passCheck.errors[0] ?? "Senha inválida." };
      }
    }

    await prisma.$transaction(async (tx) => {
      await assertBarberBelongsToCompany(tx, companyId, parsed.id);
      await assertUnitsAreActive(tx, companyId, parsed.unitIds);

      const barber = await tx.barber.findFirst({
        where: { id: parsed.id, companyId },
        include: { user: true },
      });

      if (!barber) throw new Error("Profissional não encontrado.");

      let passwordHash: string | undefined;
      if (parsed.password)
        passwordHash = await bcrypt.hash(parsed.password, 12);

      await tx.barber.updateMany({
        where: { id: parsed.id, companyId },
        data: {
          name: parsed.name,
          email: parsed.email,
          phone: parsed.phone,
          imageUrl: normalizedImageUrl,
        },
      });

      if (barber.user) {
        await tx.user.updateMany({
          where: { id: barber.user.id },
          data: {
            name: parsed.name,
            email: parsed.email,
            phone: parsed.phone,
            ...(passwordHash ? { passwordHash } : {}),
            image: normalizedImageUrl,
            isActive: true,
            role: Role.BARBER,
          },
        });

        await ensureCompanyMembership(tx, {
          companyId,
          userId: barber.user.id,
          role: CompanyMemberRole.STAFF,
        });
      } else if (passwordHash) {
        const user = await tx.user.create({
          data: {
            name: parsed.name,
            email: parsed.email,
            role: Role.BARBER,
            passwordHash,
            image: normalizedImageUrl,
            phone: parsed.phone,
            isActive: true,
          },
        });

        await ensureCompanyMembership(tx, {
          companyId,
          userId: user.id,
          role: CompanyMemberRole.STAFF,
        });

        await tx.barber.updateMany({
          where: { id: parsed.id, companyId },
          data: { userId: user.id },
        });
      }

      await syncBarberUnits(tx, companyId, parsed.id, parsed.unitIds);
    });

    revalidatePath("/admin/professional");
    return { ok: true };
  } catch (err: any) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return { ok: false, error: "Já existe um profissional com esse e-mail." };
    }

    if (err?.message) {
      console.error("[updateBarber] Regra de negócio:", err.message);
      return { ok: false, error: String(err.message) };
    }

    console.error("[updateBarber] Erro inesperado:", err);
    return { ok: false, error: "Erro ao atualizar profissional." };
  }
}

export async function toggleBarberStatus(formData: FormData): Promise<void> {
  const companyId = await requireCompanyId();
  const barberId = String(formData.get("barberId"));

  const barber = await prisma.barber.findFirst({
    where: { id: barberId, companyId },
  });

  if (!barber) return;

  await prisma.barber.updateMany({
    where: { id: barberId, companyId },
    data: { isActive: !barber.isActive },
  });

  revalidatePath("/admin/professional");
}
