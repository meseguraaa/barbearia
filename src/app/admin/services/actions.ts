"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/**
 * Cria um novo serviço a partir do formulário da página de admin.
 * Espera campos:
 * - name
 * - price
 * - durationMinutes
 */
export async function createService(formData: FormData) {
  const rawName = formData.get("name");
  const rawPrice = formData.get("price");
  const rawDuration = formData.get("durationMinutes");

  const name = String(rawName ?? "").trim();
  const priceString = String(rawPrice ?? "")
    .replace(",", ".")
    .trim();
  const durationString = String(rawDuration ?? "").trim();

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

  await prisma.service.create({
    data: {
      name,
      price,
      durationMinutes,
      isActive: true,
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
 */
export async function updateService(id: string, formData: FormData) {
  const rawName = formData.get("name");
  const rawPrice = formData.get("price");
  const rawDuration = formData.get("durationMinutes");

  const name = String(rawName ?? "").trim();
  const priceString = String(rawPrice ?? "")
    .replace(",", ".")
    .trim();
  const durationString = String(rawDuration ?? "").trim();

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

  await prisma.service.update({
    where: { id },
    data: {
      name,
      price,
      durationMinutes,
    },
  });

  revalidatePath("/admin/services");
}
