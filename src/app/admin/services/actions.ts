// app/admin/services/actions.ts
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

  await prisma.service.create({
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

  await prisma.service.update({
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

/**
 * Atribui um plano a um cliente (cria ClientPlan)
 */
export async function createClientPlanForClient(formData: FormData) {
  const planId = String(formData.get("planId") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();

  if (!planId || !clientId) {
    throw new Error("Plano e cliente são obrigatórios.");
  }

  const plan = await prisma.plan.findUnique({
    where: { id: planId },
  });

  if (!plan) {
    throw new Error("Plano não encontrado.");
  }

  // Regra: 1 plano ativo por cliente
  const existingActivePlan = await prisma.clientPlan.findFirst({
    where: {
      clientId,
      status: "ACTIVE",
    },
  });

  if (existingActivePlan) {
    throw new Error("Este cliente já possui um plano ativo.");
  }

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + plan.durationDays);

  await prisma.clientPlan.create({
    data: {
      clientId,
      planId,
      startDate,
      endDate,
      usedBookings: 0,
      status: "ACTIVE",
    },
  });

  revalidateAll();
}

/**
 * Marca um ClientPlan como EXPIRADO
 */
export async function expireClientPlan(formData: FormData) {
  const clientPlanId = String(formData.get("clientPlanId") ?? "").trim();

  if (!clientPlanId) {
    throw new Error("ID do plano do cliente é obrigatório.");
  }

  const clientPlan = await prisma.clientPlan.findUnique({
    where: { id: clientPlanId },
  });

  if (!clientPlan) {
    throw new Error("Plano do cliente não encontrado.");
  }

  if (clientPlan.status !== "ACTIVE") {
    // nada a fazer, mas não precisa quebrar
    return;
  }

  await prisma.clientPlan.update({
    where: { id: clientPlanId },
    data: {
      status: "EXPIRED",
    },
  });

  revalidateAll();
}

/**
 * Revalida um plano de cliente:
 * - Expira o plano atual (se ainda não estiver expirado)
 * - Cria um novo ClientPlan para o mesmo cliente com o plano escolhido
 */
export async function revalidateClientPlan(formData: FormData) {
  const clientPlanId = String(formData.get("clientPlanId") ?? "").trim();
  const newPlanId = String(formData.get("newPlanId") ?? "").trim();

  if (!clientPlanId || !newPlanId) {
    throw new Error("Plano atual e novo plano são obrigatórios.");
  }

  const clientPlan = await prisma.clientPlan.findUnique({
    where: { id: clientPlanId },
    include: {
      plan: true,
    },
  });

  if (!clientPlan) {
    throw new Error("Plano do cliente não encontrado.");
  }

  // Agora aceitamos revalidar planos ACTIVE ou EXPIRED,
  // desde que já tenham todos os créditos usados.
  if (clientPlan.status !== "ACTIVE" && clientPlan.status !== "EXPIRED") {
    throw new Error("Apenas planos ativos ou expirados podem ser revalidados.");
  }

  // Regra de negócio: só revalidar se já usou todos os créditos
  const totalBookings = clientPlan.plan.totalBookings;
  if (clientPlan.usedBookings < totalBookings) {
    throw new Error(
      "Este plano ainda possui créditos disponíveis e não pode ser revalidado.",
    );
  }

  const newPlan = await prisma.plan.findUnique({
    where: { id: newPlanId },
  });

  if (!newPlan) {
    throw new Error("Novo plano não encontrado.");
  }

  if (!newPlan.isActive) {
    throw new Error("Não é possível revalidar com um plano inativo.");
  }

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + newPlan.durationDays);

  await prisma.$transaction(async (tx) => {
    // Expira o plano atual (caso ainda não esteja expirado)
    if (clientPlan.status !== "EXPIRED") {
      await tx.clientPlan.update({
        where: { id: clientPlanId },
        data: {
          status: "EXPIRED",
        },
      });
    }

    // Cria um novo plano para o cliente
    await tx.clientPlan.create({
      data: {
        clientId: clientPlan.clientId,
        planId: newPlan.id,
        startDate,
        endDate,
        usedBookings: 0,
        status: "ACTIVE",
      },
    });
  });

  revalidateAll();
}
