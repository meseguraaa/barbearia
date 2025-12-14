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

/**
 * ✅ unitIds obrigatório (onboarding: cria unidade -> cria profissional)
 */
const createBarberSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().optional(),
  password: z.string().min(5, "Senha deve ter pelo menos 5 caracteres"),
  imageUrl: imageUrlSchema,

  // ✅ obrigatório
  unitIds: z.array(z.string().min(1)).min(1, "Selecione ao menos 1 unidade"),
});

const updateBarberSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Nome obrigatório"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().optional(),
  password: z.string().optional(),
  imageUrl: imageUrlSchema,

  // ✅ obrigatório também no update (integridade)
  unitIds: z.array(z.string().min(1)).min(1, "Selecione ao menos 1 unidade"),
});

async function assertUnitsAreActive(
  tx: Prisma.TransactionClient,
  unitIds: string[],
) {
  if (!unitIds || unitIds.length === 0) {
    throw new Error("Selecione ao menos 1 unidade.");
  }

  const count = await tx.unit.count({
    where: {
      id: { in: unitIds },
      isActive: true,
    },
  });

  if (count !== unitIds.length) {
    throw new Error("Uma ou mais unidades são inválidas ou estão inativas.");
  }
}

async function syncBarberUnits(
  tx: Prisma.TransactionClient,
  barberId: string,
  unitIds: string[],
) {
  // 1) desativa tudo que NÃO está selecionado
  await tx.barberUnit.updateMany({
    where: {
      barberId,
      unitId: { notIn: unitIds },
    },
    data: { isActive: false },
  });

  // 2) garante que selecionadas existam e fiquem ativas (ativa se já existe, cria se não existe)
  await Promise.all(
    unitIds.map((unitId) =>
      tx.barberUnit.upsert({
        where: {
          // Prisma gera esse nome por padrão para @@unique([barberId, unitId])
          barberId_unitId: { barberId, unitId },
        },
        update: { isActive: true },
        create: { barberId, unitId, isActive: true },
      }),
    ),
  );
}

export async function createBarber(formData: FormData): Promise<void> {
  const rawPassword = String(formData.get("password") ?? "");

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
    return;
  }

  const parsed = result.data;
  const normalizedImageUrl = normalizeImageUrl(parsed.imageUrl as any);

  try {
    await prisma.$transaction(async (tx) => {
      // ✅ garante que todas as unidades existem e estão ativas
      await assertUnitsAreActive(tx, parsed.unitIds);

      const passwordHash = await bcrypt.hash(parsed.password, 10);

      // 1) cria usuário que loga no painel
      const user = await tx.user.create({
        data: {
          name: parsed.name,
          email: parsed.email,
          role: Role.BARBER,
          passwordHash,
          image: normalizedImageUrl,
          phone: parsed.phone,
        },
      });

      // 2) cria barber
      const barber = await tx.barber.create({
        data: {
          name: parsed.name,
          email: parsed.email,
          phone: parsed.phone,
          userId: user.id,
        },
      });

      // 3) cria vínculos BarberUnit (ativos)
      await tx.barberUnit.createMany({
        data: parsed.unitIds.map((unitId) => ({
          barberId: barber.id,
          unitId,
          isActive: true,
        })),
        skipDuplicates: true,
      });
    });
  } catch (err: any) {
    // P2002 = unique constraint (email duplicado em User/Barber)
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      console.warn(
        "[createBarber] E-mail já cadastrado em User ou Barber:",
        parsed.email,
      );
      return;
    }

    // erro de regra (unidade inválida/inativa)
    if (err?.message) {
      console.error("[createBarber] Regra de negócio:", err.message);
      return;
    }

    console.error("[createBarber] Erro inesperado:", err);
    return;
  }

  revalidatePath("/admin/professional");
  redirect("/admin/professional");
}

export async function updateBarber(formData: FormData): Promise<void> {
  const rawPassword = String(formData.get("password") ?? "");

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
    return;
  }

  const parsed = result.data;
  const normalizedImageUrl = normalizeImageUrl(parsed.imageUrl as any);

  try {
    await prisma.$transaction(async (tx) => {
      // ✅ garante que unidades selecionadas existem e estão ativas
      await assertUnitsAreActive(tx, parsed.unitIds);

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

      // 1) atualiza barber
      await tx.barber.update({
        where: { id: parsed.id },
        data: {
          name: parsed.name,
          email: parsed.email,
          phone: parsed.phone,
        },
      });

      // 2) atualiza user (se existir)
      if (barber.user) {
        await tx.user.update({
          where: { id: barber.user.id },
          data: {
            name: parsed.name,
            email: parsed.email,
            phone: parsed.phone,
            ...(passwordHash ? { passwordHash } : {}),
            image: normalizedImageUrl,
          },
        });
      } else if (passwordHash) {
        // cria user se não existir e admin definiu senha
        const user = await tx.user.create({
          data: {
            name: parsed.name,
            email: parsed.email,
            role: Role.BARBER,
            passwordHash,
            image: normalizedImageUrl,
            phone: parsed.phone,
          },
        });

        await tx.barber.update({
          where: { id: parsed.id },
          data: { userId: user.id },
        });
      }

      // 3) sincroniza vínculos BarberUnit (obrigatório)
      await syncBarberUnits(tx, parsed.id, parsed.unitIds);
    });
  } catch (err: any) {
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

    if (err?.message) {
      console.error("[updateBarber] Regra de negócio:", err.message);
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
