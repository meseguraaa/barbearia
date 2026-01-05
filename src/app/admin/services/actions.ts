// src/app/admin/services/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  requireAdminPermission,
  requireAdminWithPermissions,
} from "@/lib/admin-permissions";

/* =====================================================================
 * TENANT CONTEXT (fonte da verdade: admin logado)
 * ===================================================================== */

type AdminContext = {
  companyId?: string;
};

async function getAdminCompanyIdOrThrow(): Promise<string> {
  const currentAdmin = (await requireAdminWithPermissions()) as AdminContext;
  const companyId = currentAdmin.companyId?.trim();

  if (!companyId) {
    throw new Error(
      "[admin/services/actions] ADMIN sem companyId. Este painel é multi-tenant: vincule o admin a uma empresa (companyId).",
    );
  }

  return companyId;
}

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

async function getUnitIdFromFormOrDefault(
  formData: FormData,
  companyId: string,
): Promise<string> {
  const raw = formData.get("unitId");
  const fromForm = String(raw ?? "").trim();

  if (fromForm) {
    const exists = await prisma.unit.findFirst({
      where: { id: fromForm, companyId },
      select: { id: true },
    });

    if (!exists) {
      throw new Error("Unidade inválida para esta empresa.");
    }

    return fromForm;
  }

  const unit =
    (await prisma.unit.findFirst({
      where: { companyId, isActive: true },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    })) ??
    (await prisma.unit.findFirst({
      where: { companyId },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    }));

  if (!unit) {
    throw new Error(
      "Nenhuma unidade encontrada. Crie uma unidade antes de cadastrar serviços.",
    );
  }

  return unit.id;
}

async function assertServiceBelongsToCompany(args: {
  id: string;
  companyId: string;
}) {
  const ok = await prisma.service.findFirst({
    where: { id: args.id, companyId: args.companyId },
    select: { id: true },
  });
  if (!ok) throw new Error("Serviço não encontrado.");
}

/* =====================================================================
 * SERVIÇOS
 * ===================================================================== */

export async function createService(formData: FormData) {
  await requireAdminPermission("canAccessServices");
  const companyId = await getAdminCompanyIdOrThrow();

  const name = String(formData.get("name") ?? "").trim();

  const price = toNumber(formData.get("price"));
  const durationMinutes = toNumber(formData.get("durationMinutes"));
  const barberPercentage = toNumber(formData.get("barberPercentage"), true);
  const cancelLimitHours = toNumber(formData.get("cancelLimitHours"), true);
  const cancelFeePercentage = toNumber(
    formData.get("cancelFeePercentage"),
    true,
  );

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

  const unitId = await getUnitIdFromFormOrDefault(formData, companyId);

  if (professionalIds.length > 0) {
    const found = await prisma.barber.findMany({
      where: { id: { in: professionalIds }, companyId },
      select: { id: true },
    });

    const foundIds = new Set(found.map((p) => p.id));
    const invalid = professionalIds.filter((id) => !foundIds.has(id));

    if (invalid.length) {
      throw new Error("Profissional inválido para esta empresa.");
    }
  }

  await prisma.$transaction(async (tx) => {
    // ✅ cria o service de forma “checked” (company relation)
    const service = await tx.service.create({
      data: {
        company: { connect: { id: companyId } },
        unit: { connect: { id: unitId } },

        name,
        price,
        durationMinutes,
        isActive: true,
        barberPercentage: barberPercentage ?? 0,
        cancelLimitHours: cancelLimitHours ?? null,
        cancelFeePercentage: cancelFeePercentage ?? null,
      },
      select: { id: true },
    });

    // ✅ vincula profissionais pelo pivô (mais estável que nested create)
    if (professionalIds.length > 0) {
      await tx.serviceProfessional.createMany({
        data: professionalIds.map((barberId) => ({
          companyId,
          serviceId: service.id,
          barberId,
        })),
        skipDuplicates: true,
      });
    }
  });

  revalidateAll();
}

export async function toggleServiceStatus(formData: FormData) {
  await requireAdminPermission("canAccessServices");
  const companyId = await getAdminCompanyIdOrThrow();

  const id = String(formData.get("serviceId") ?? "").trim();
  if (!id) throw new Error("ID do serviço é obrigatório.");

  const service = await prisma.service.findFirst({
    where: { id, companyId },
    select: { id: true, isActive: true },
  });

  if (!service) {
    throw new Error("Serviço não encontrado.");
  }

  const res = await prisma.service.updateMany({
    where: { id, companyId },
    data: { isActive: !service.isActive },
  });

  if (res.count === 0) {
    throw new Error("Falha ao atualizar o serviço (escopo inválido).");
  }

  revalidateAll();
}

export async function updateService(id: string, formData: FormData) {
  await requireAdminPermission("canAccessServices");
  const companyId = await getAdminCompanyIdOrThrow();

  const name = String(formData.get("name") ?? "").trim();

  const price = toNumber(formData.get("price"));
  const durationMinutes = toNumber(formData.get("durationMinutes"));
  const barberPercentage = toNumber(formData.get("barberPercentage"), true);
  const cancelLimitHours = toNumber(formData.get("cancelLimitHours"), true);
  const cancelFeePercentage = toNumber(
    formData.get("cancelFeePercentage"),
    true,
  );

  const rawProfessionalIds = formData.getAll("professionalIds");
  const professionalIds = rawProfessionalIds
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

  if (!id) throw new Error("ID do serviço é obrigatório.");

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

  await assertServiceBelongsToCompany({ id, companyId });

  if (professionalIds.length > 0) {
    const found = await prisma.barber.findMany({
      where: { id: { in: professionalIds }, companyId },
      select: { id: true },
    });

    const foundIds = new Set(found.map((p) => p.id));
    const invalid = professionalIds.filter((pid) => !foundIds.has(pid));

    if (invalid.length) {
      throw new Error("Profissional inválido para esta empresa.");
    }
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.service.updateMany({
      where: { id, companyId },
      data: {
        name,
        price,
        durationMinutes,
        barberPercentage: barberPercentage ?? 0,
        cancelLimitHours: cancelLimitHours ?? null,
        cancelFeePercentage: cancelFeePercentage ?? null,
      },
    });

    if (updated.count === 0) {
      throw new Error("Falha ao atualizar o serviço (escopo inválido).");
    }

    // reseta vínculos e recria
    await tx.serviceProfessional.deleteMany({
      where: { serviceId: id, companyId },
    });

    if (professionalIds.length > 0) {
      await tx.serviceProfessional.createMany({
        data: professionalIds.map((barberId) => ({
          companyId,
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

export async function createPlan(formData: FormData) {
  await requireAdminPermission("canAccessServices");
  const companyId = await getAdminCompanyIdOrThrow();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  const price = toNumber(formData.get("price"));
  const commissionPercent = toNumber(formData.get("commissionPercent"));

  const durationDays = toNumber(formData.get("durationDays")) ?? 30;
  const totalBookings = toNumber(formData.get("totalBookings")) ?? 4;

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

  if (serviceIds.length > 0) {
    const found = await prisma.service.findMany({
      where: { id: { in: serviceIds }, companyId },
      select: { id: true },
    });

    const foundIds = new Set(found.map((s) => s.id));
    const invalid = serviceIds.filter((sid) => !foundIds.has(sid));

    if (invalid.length) {
      throw new Error("Serviço inválido para esta empresa.");
    }
  }

  const plan = await prisma.plan.create({
    data: {
      company: { connect: { id: companyId } },

      name,
      description,
      price,
      commissionPercent,
      durationDays,
      totalBookings,
      isActive: true,

      // ✅ se seu schema tiver pivô planService, é mais estável usar createMany depois
      services: {
        create: serviceIds.map((serviceId) => ({
          company: { connect: { id: companyId } },
          service: { connect: { id: serviceId } },
        })),
      },
    },
  });

  if (!plan) throw new Error("Falha ao criar o plano.");

  revalidateAll();
}

export async function togglePlanStatus(formData: FormData) {
  await requireAdminPermission("canAccessServices");
  const companyId = await getAdminCompanyIdOrThrow();

  const id = String(formData.get("planId") ?? "").trim();
  if (!id) throw new Error("ID do plano é obrigatório.");

  const plan = await prisma.plan.findFirst({
    where: { id, companyId },
    select: { id: true, isActive: true },
  });

  if (!plan) throw new Error("Plano não encontrado.");

  const res = await prisma.plan.updateMany({
    where: { id, companyId },
    data: { isActive: !plan.isActive },
  });

  if (res.count === 0) {
    throw new Error("Falha ao atualizar o plano (escopo inválido).");
  }

  revalidateAll();
}

export async function updatePlan(id: string, formData: FormData) {
  await requireAdminPermission("canAccessServices");
  const companyId = await getAdminCompanyIdOrThrow();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  const price = toNumber(formData.get("price"));
  const commissionPercent = toNumber(formData.get("commissionPercent"));

  const durationDays = toNumber(formData.get("durationDays")) ?? 30;
  const totalBookings = toNumber(formData.get("totalBookings")) ?? 4;

  if (!id) throw new Error("ID do plano é obrigatório.");

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

  const exists = await prisma.plan.findFirst({
    where: { id, companyId },
    select: { id: true },
  });
  if (!exists) throw new Error("Plano não encontrado.");

  if (serviceIds.length > 0) {
    const found = await prisma.service.findMany({
      where: { id: { in: serviceIds }, companyId },
      select: { id: true },
    });

    const foundIds = new Set(found.map((s) => s.id));
    const invalid = serviceIds.filter((sid) => !foundIds.has(sid));

    if (invalid.length) {
      throw new Error("Serviço inválido para esta empresa.");
    }
  }

  const updated = await prisma.plan.updateMany({
    where: { id, companyId },
    data: {
      name,
      description,
      price,
      commissionPercent,
      durationDays,
      totalBookings,
    },
  });

  if (updated.count === 0) {
    throw new Error("Falha ao atualizar o plano (escopo inválido).");
  }

  await prisma.planService.deleteMany({
    where: { planId: id, companyId },
  });

  if (serviceIds.length > 0) {
    await prisma.planService.createMany({
      data: serviceIds.map((serviceId) => ({
        companyId,
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

export async function createClientPlanForClient(formData: FormData) {
  await requireAdminPermission("canAccessServices");
  const companyId = await getAdminCompanyIdOrThrow();

  const planId = String(formData.get("planId") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();

  if (!planId || !clientId) {
    throw new Error("Plano e cliente são obrigatórios.");
  }

  const plan = await prisma.plan.findFirst({
    where: { id: planId, companyId },
    select: { id: true, durationDays: true },
  });

  if (!plan) {
    throw new Error("Plano não encontrado.");
  }

  // ✅ FIX: UserWhereInput não tem companyId no seu schema.
  // Multi-tenant correto aqui é validar via CompanyMember.
  const clientMember = await prisma.companyMember.findFirst({
    where: {
      companyId,
      userId: clientId,
      isActive: true,
      user: { role: "CLIENT" },
    },
    select: { userId: true },
  });

  if (!clientMember) {
    throw new Error("Cliente não encontrado.");
  }

  const existingActivePlan = await prisma.clientPlan.findFirst({
    where: { companyId, clientId, status: "ACTIVE" },
    select: { id: true },
  });

  if (existingActivePlan) {
    throw new Error("Este cliente já possui um plano ativo.");
  }

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + plan.durationDays);

  await prisma.clientPlan.create({
    data: {
      companyId,
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

export async function expireClientPlan(formData: FormData) {
  await requireAdminPermission("canAccessServices");
  const companyId = await getAdminCompanyIdOrThrow();

  const clientPlanId = String(formData.get("clientPlanId") ?? "").trim();
  if (!clientPlanId) {
    throw new Error("ID do plano do cliente é obrigatório.");
  }

  const clientPlan = await prisma.clientPlan.findFirst({
    where: { id: clientPlanId, companyId },
    select: { id: true, status: true },
  });

  if (!clientPlan) {
    throw new Error("Plano do cliente não encontrado.");
  }

  if (clientPlan.status !== "ACTIVE") return;

  const res = await prisma.clientPlan.updateMany({
    where: { id: clientPlanId, companyId },
    data: { status: "EXPIRED" },
  });

  if (res.count === 0) {
    throw new Error("Falha ao expirar o plano (escopo inválido).");
  }

  revalidateAll();
}

export async function revalidateClientPlan(formData: FormData) {
  await requireAdminPermission("canAccessServices");
  const companyId = await getAdminCompanyIdOrThrow();

  const clientPlanId = String(formData.get("clientPlanId") ?? "").trim();
  const newPlanId = String(formData.get("newPlanId") ?? "").trim();

  if (!clientPlanId || !newPlanId) {
    throw new Error("Plano atual e novo plano são obrigatórios.");
  }

  const clientPlan = await prisma.clientPlan.findFirst({
    where: { id: clientPlanId, companyId },
    include: { plan: true },
  });

  if (!clientPlan) {
    throw new Error("Plano do cliente não encontrado.");
  }

  if (clientPlan.status !== "ACTIVE" && clientPlan.status !== "EXPIRED") {
    throw new Error("Apenas planos ativos ou expirados podem ser revalidados.");
  }

  const totalBookings = clientPlan.plan.totalBookings;
  if (clientPlan.usedBookings < totalBookings) {
    throw new Error(
      "Este plano ainda possui créditos disponíveis e não pode ser revalidado.",
    );
  }

  const newPlan = await prisma.plan.findFirst({
    where: { id: newPlanId, companyId },
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
    if (clientPlan.status !== "EXPIRED") {
      const expired = await tx.clientPlan.updateMany({
        where: { id: clientPlanId, companyId },
        data: { status: "EXPIRED" },
      });

      if (expired.count === 0) {
        throw new Error("Falha ao expirar o plano atual (escopo inválido).");
      }
    }

    await tx.clientPlan.create({
      data: {
        companyId,
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
