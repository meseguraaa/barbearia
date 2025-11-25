"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/**
 * Cria um novo serviço a partir do formulário da página de admin.
 * Espera campos:
 * - name
 * - price
 * - durationMinutes
 * - barberPercentage
 * - cancelLimitHours (opcional)
 * - cancelFeePercentage (opcional)
 */
export async function createService(formData: FormData) {
  const rawName = formData.get("name");
  const rawPrice = formData.get("price");
  const rawDuration = formData.get("durationMinutes");
  const rawBarberPercentage = formData.get("barberPercentage");
  const rawCancelLimitHours = formData.get("cancelLimitHours");
  const rawCancelFeePercentage = formData.get("cancelFeePercentage");

  const name = String(rawName ?? "").trim();

  const priceString = String(rawPrice ?? "")
    .replace(",", ".")
    .trim();

  const durationString = String(rawDuration ?? "").trim();

  const barberPercentageString = String(rawBarberPercentage ?? "")
    .replace(",", ".")
    .trim();

  const cancelLimitHoursString = String(rawCancelLimitHours ?? "").trim();

  const cancelFeePercentageString = String(rawCancelFeePercentage ?? "")
    .replace(",", ".")
    .trim();

  if (!name || name.length < 2) {
    throw new Error("O nome do serviço deve ter pelo menos 2 caracteres.");
  }

  const price = Number(priceString);
  if (!price || isNaN(price) || price <= 0) {
    throw new Error("O valor deve ser um número maior que zero.");
  }

  const durationMinutes = Number(durationString);
  if (!durationMinutes || isNaN(durationMinutes) || durationMinutes <= 0) {
    throw new Error("A duração deve ser um número maior que zero.");
  }

  const barberPercentage = Number(barberPercentageString || "0");
  if (
    isNaN(barberPercentage) ||
    barberPercentage < 0 ||
    barberPercentage > 100
  ) {
    throw new Error(
      "A porcentagem do barbeiro deve ser um número entre 0 e 100.",
    );
  }

  let cancelLimitHours: number | null = null;
  if (cancelLimitHoursString) {
    const parsed = Number(cancelLimitHoursString);
    if (isNaN(parsed) || parsed < 0) {
      throw new Error(
        "O limite de cancelamento deve ser um número maior ou igual a zero.",
      );
    }
    cancelLimitHours = parsed;
  }

  let cancelFeePercentage: number | null = null;
  if (cancelFeePercentageString) {
    const parsed = Number(cancelFeePercentageString);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      throw new Error(
        "A taxa de cancelamento deve ser um número entre 0 e 100.",
      );
    }
    cancelFeePercentage = parsed;
  }

  await prisma.service.create({
    data: {
      name,
      price,
      durationMinutes,
      isActive: true,
      barberPercentage,
      cancelLimitHours,
      cancelFeePercentage,
    },
  });

  // Atualiza a página de serviços do admin
  revalidatePath("/admin/services");
}

/**
 * Ativa / desativa um serviço.
 * Espera campo:
 * - serviceId
 */
export async function toggleServiceStatus(formData: FormData) {
  const rawId = formData.get("serviceId");
  const id = String(rawId ?? "").trim();

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

  revalidatePath("/admin/services");
}

/**
 * Atualiza um serviço existente.
 * Espera campos no form:
 * - name
 * - price
 * - durationMinutes
 * - barberPercentage
 * - cancelLimitHours (opcional)
 * - cancelFeePercentage (opcional)
 */
export async function updateService(id: string, formData: FormData) {
  const rawName = formData.get("name");
  const rawPrice = formData.get("price");
  const rawDuration = formData.get("durationMinutes");
  const rawBarberPercentage = formData.get("barberPercentage");
  const rawCancelLimitHours = formData.get("cancelLimitHours");
  const rawCancelFeePercentage = formData.get("cancelFeePercentage");

  const name = String(rawName ?? "").trim();

  const priceString = String(rawPrice ?? "")
    .replace(",", ".")
    .trim();

  const durationString = String(rawDuration ?? "").trim();

  const barberPercentageString = String(rawBarberPercentage ?? "")
    .replace(",", ".")
    .trim();

  const cancelLimitHoursString = String(rawCancelLimitHours ?? "").trim();

  const cancelFeePercentageString = String(rawCancelFeePercentage ?? "")
    .replace(",", ".")
    .trim();

  if (!id) {
    throw new Error("ID do serviço é obrigatório.");
  }

  if (!name || name.length < 2) {
    throw new Error("O nome do serviço deve ter pelo menos 2 caracteres.");
  }

  const price = Number(priceString);
  if (!price || isNaN(price) || price <= 0) {
    throw new Error("O valor deve ser um número maior que zero.");
  }

  const durationMinutes = Number(durationString);
  if (!durationMinutes || isNaN(durationMinutes) || durationMinutes <= 0) {
    throw new Error("A duração deve ser um número maior que zero.");
  }

  const barberPercentage = Number(barberPercentageString || "0");
  if (
    isNaN(barberPercentage) ||
    barberPercentage < 0 ||
    barberPercentage > 100
  ) {
    throw new Error(
      "A porcentagem do barbeiro deve ser um número entre 0 e 100.",
    );
  }

  let cancelLimitHours: number | null = null;
  if (cancelLimitHoursString) {
    const parsed = Number(cancelLimitHoursString);
    if (isNaN(parsed) || parsed < 0) {
      throw new Error(
        "O limite de cancelamento deve ser um número maior ou igual a zero.",
      );
    }
    cancelLimitHours = parsed;
  }

  let cancelFeePercentage: number | null = null;
  if (cancelFeePercentageString) {
    const parsed = Number(cancelFeePercentageString);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      throw new Error(
        "A taxa de cancelamento deve ser um número entre 0 e 100.",
      );
    }
    cancelFeePercentage = parsed;
  }

  await prisma.service.update({
    where: { id },
    data: {
      name,
      price,
      durationMinutes,
      barberPercentage,
      cancelLimitHours,
      cancelFeePercentage,
    },
  });

  revalidatePath("/admin/services");
}
