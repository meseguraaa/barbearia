"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/* =====================================================================
 * HELPERS
 * ===================================================================== */

function toNumber(value: FormDataEntryValue | null, allowEmpty = false) {
  const str = String(value ?? "")
    .replace(",", ".")
    .trim();

  if (allowEmpty && str === "") return null;

  const num = Number(str);
  if (Number.isNaN(num)) return null;
  return num;
}

function revalidateAll() {
  revalidatePath("/admin/services");
}

/* =====================================================================
 * SERVIÇOS
 * ===================================================================== */

/**
 * Cria um novo serviço
 */
export async function createService(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();

  const price = toNumber(formData.get("price"));
  const durationMinutes = toNumber(formData.get("durationMinutes"));
  const barberPercentage = toNumber(formData.get("barberPercentage"), true);
  const cancelLimitHours = toNumber(formData.get("cancelLimitHours"), true);
  const cancelFeePercentage = toNumber(
    formData.get("cancelFeePercentage"),
    true,
  );

  // IDs dos profissionais que executam este serviço
  const rawProfessionalIds = formData.getAll("professionalIds");
  const professionalIds = rawProfessionalIds
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  if (!name || name.length < 2) {
    throw new Error("O nome do serviço deve ter pelo menos 2 caracteres.");
  }

  if (!price || price <= 0) {
    throw new Error("O valor deve ser um número maior que zero.");
  }

  if (!durationMinutes || durationMinutes <= 0) {
    throw new Error("A duração deve ser um número maior que zero.");
  }

  if (barberPercentage !== null) {
    if (barberPercentage < 0 || barberPercentage > 100) {
      throw new Error(
        "A porcentagem do barbeiro deve ser um número entre 0 e 100.",
      );
    }
  }

  if (cancelLimitHours !== null && cancelLimitHours < 0) {
    throw new Error(
      "O limite de cancelamento deve ser um número maior ou igual a zero.",
    );
  }

  if (cancelFeePercentage !== null) {
    if (cancelFeePercentage < 0 || cancelFeePercentage > 100) {
      throw new Error(
        "A taxa de cancelamento deve ser um número entre 0 e 100.",
      );
    }
  }

  // cria o serviço + vínculos com profissionais (se vierem)
  await prisma.$transaction(async (tx) => {
    const service = await tx.service.create({
      data: {
        name,
        price,
        durationMinutes,
        isActive: true,
        barberPercentage: barberPercentage ?? 0,
        cancelLimitHours: cancelLimitHours ?? null,
        cancelFeePercentage: cancelFeePercentage ?? null,
      },
    });

    if (professionalIds.length > 0) {
      await tx.serviceProfessional.createMany({
        data: professionalIds.map((barberId) => ({
          serviceId: service.id,
          barberId,
        })),
        skipDuplicates: true,
      });
    }
  });

  revalidateAll();
}

/**
 * Ativa / desativa um serviço
 */
export async function toggleServiceStatus(formData: FormData) {
  const id = String(formData.get("serviceId") ?? "").trim();

  if (!id) {
    throw new Error("ID do serviço é obrigatório.");
  }

  const service = await prisma.service.findUnique({
    where: { id },
  });

  if (!service) {
    throw new Error("Serviço não encontrado.");
  }

  await prisma.service.update({
    where: { id },
    data: {
      isActive: !service.isActive,
    },
  });

  revalidateAll();
}

/**
 * Atualiza um serviço existente
 */
export async function updateService(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();

  const price = toNumber(formData.get("price"));
  const durationMinutes = toNumber(formData.get("durationMinutes"));
  const barberPercentage = toNumber(formData.get("barberPercentage"), true);
  const cancelLimitHours = toNumber(formData.get("cancelLimitHours"), true);
  const cancelFeePercentage = toNumber(
    formData.get("cancelFeePercentage"),
    true,
  );

  // IDs dos profissionais que executam este serviço
  const rawProfessionalIds = formData.getAll("professionalIds");
  const professionalIds = rawProfessionalIds
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  if (!id) {
    throw new Error("ID do serviço é obrigatório.");
  }

  if (!name || name.length < 2) {
    throw new Error("O nome do serviço deve ter pelo menos 2 caracteres.");
  }

  if (!price || price <= 0) {
    throw new Error("O valor deve ser um número maior que zero.");
  }

  if (!durationMinutes || durationMinutes <= 0) {
    throw new Error("A duração deve ser um número maior que zero.");
  }

  if (barberPercentage !== null) {
    if (barberPercentage < 0 || barberPercentage > 100) {
      throw new Error(
        "A porcentagem do barbeiro deve ser um número entre 0 e 100.",
      );
    }
  }

  if (cancelLimitHours !== null && cancelLimitHours < 0) {
    throw new Error(
      "O limite de cancelamento deve ser um número maior ou igual a zero.",
    );
  }

  if (cancelFeePercentage !== null) {
    if (cancelFeePercentage < 0 || cancelFeePercentage > 100) {
      throw new Error(
        "A taxa de cancelamento deve ser um número entre 0 e 100.",
      );
    }
  }

  // atualiza serviço + vínculos com profissionais na mesma transação
  await prisma.$transaction(async (tx) => {
    await tx.service.update({
      where: { id },
      data: {
        name,
        price,
        durationMinutes,
        barberPercentage: barberPercentage ?? 0,
        cancelLimitHours: cancelLimitHours ?? null,
        cancelFeePercentage: cancelFeePercentage ?? null,
      },
    });

    // reseta vínculos antigos
    await tx.serviceProfessional.deleteMany({
      where: { serviceId: id },
    });

    // recria vínculos novos
    if (professionalIds.length > 0) {
      await tx.serviceProfessional.createMany({
        data: professionalIds.map((barberId) => ({
          serviceId: id,
          barberId,
        })),
        skipDuplicates: true,
      });
    }
  });

  revalidateAll();
}

/* =====================================================================
 * PLANOS
 * ===================================================================== */

/**
 * Cria um novo plano de assinatura
 */
export async function createPlan(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  const price = toNumber(formData.get("price"));
  const commissionPercent = toNumber(formData.get("commissionPercent"));

  // esses vêm escondidos no form, mas validamos mesmo assim
  const durationDays = toNumber(formData.get("durationDays")) ?? 30; // default 30
  const totalBookings = toNumber(formData.get("totalBookings")) ?? 4; // default 4

  if (!name || name.length < 2) {
    throw new Error("O nome do plano deve ter pelo menos 2 caracteres.");
  }

  if (!price || price <= 0) {
    throw new Error("O valor do plano deve ser maior que zero.");
  }

  if (!commissionPercent || commissionPercent < 0 || commissionPercent > 100) {
    throw new Error("A comissão do barbeiro deve ser um número entre 0 e 100.");
  }

  if (!durationDays || durationDays <= 0) {
    throw new Error("A duração do plano deve ser maior que zero.");
  }

  if (!totalBookings || totalBookings <= 0) {
    throw new Error("O número de agendamentos deve ser maior que zero.");
  }

  const rawServiceIds = formData.getAll("serviceIds");
  const serviceIds = rawServiceIds
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  const plan = await prisma.plan.create({
    data: {
      name,
      description,
      price,
      commissionPercent,
      durationDays,
      totalBookings,
      isActive: true,
      services: {
        create: serviceIds.map((serviceId) => ({
          service: {
            connect: { id: serviceId },
          },
        })),
      },
    },
  });

  if (!plan) {
    throw new Error("Falha ao criar o plano.");
  }

  revalidateAll();
}

/**
 * Ativa / desativa um plano
 */
export async function togglePlanStatus(formData: FormData) {
  const id = String(formData.get("planId") ?? "").trim();

  if (!id) {
    throw new Error("ID do plano é obrigatório.");
  }

  const plan = await prisma.plan.findUnique({
    where: { id },
  });

  if (!plan) {
    throw new Error("Plano não encontrado.");
  }

  await prisma.plan.update({
    where: { id },
    data: {
      isActive: !plan.isActive,
    },
  });

  revalidateAll();
}

/**
 * Atualiza um plano existente
 */
export async function updatePlan(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  const price = toNumber(formData.get("price"));
  const commissionPercent = toNumber(formData.get("commissionPercent"));

  const durationDays = toNumber(formData.get("durationDays")) ?? 30; // vindo hidden
  const totalBookings = toNumber(formData.get("totalBookings")) ?? 4; // vindo hidden

  if (!id) {
    throw new Error("ID do plano é obrigatório.");
  }

  if (!name || name.length < 2) {
    throw new Error("O nome do plano deve ter pelo menos 2 caracteres.");
  }

  if (!price || price <= 0) {
    throw new Error("O valor do plano deve ser maior que zero.");
  }

  if (!commissionPercent || commissionPercent < 0 || commissionPercent > 100) {
    throw new Error("A comissão do barbeiro deve ser um número entre 0 e 100.");
  }

  if (!durationDays || durationDays <= 0) {
    throw new Error("A duração do plano deve ser maior que zero.");
  }

  if (!totalBookings || totalBookings <= 0) {
    throw new Error("O número de agendamentos deve ser maior que zero.");
  }

  const rawServiceIds = formData.getAll("serviceIds");
  const serviceIds = rawServiceIds
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  // Atualiza dados básicos
  await prisma.plan.update({
    where: { id },
    data: {
      name,
      description,
      price,
      commissionPercent,
      durationDays,
      totalBookings,
    },
  });

  // Reseta e recria os vínculos de serviços
  await prisma.planService.deleteMany({
    where: { planId: id },
  });

  if (serviceIds.length > 0) {
    await prisma.planService.createMany({
      data: serviceIds.map((serviceId) => ({
        planId: id,
        serviceId,
      })),
      skipDuplicates: true,
    });
  }

  revalidateAll();
}

/* =====================================================================
 * CLIENTE x PLANO
 * ===================================================================== */

/* ... resto do arquivo igual ao seu (createClientPlanForClient, expireClientPlan, revalidateClientPlan) ... */
