// src/utills/create-order-for-appointment.ts
"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * Cria (ou reaproveita) uma Order PENDING para um determinado agendamento.
 * Retorna a order criada/encontrada.
 */
export async function createOrderForAppointment(appointmentId: string) {
  // Se já existir uma order pra esse agendamento, reaproveita
  const existingOrder = await prisma.order.findFirst({
    where: { appointmentId },
  });

  if (existingOrder) {
    return existingOrder;
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      service: true,
    },
  });

  if (!appointment) {
    throw new Error("Agendamento não encontrado ao criar pedido.");
  }

  if (appointment.status !== "DONE") {
    throw new Error(
      "Só é possível criar pedido para agendamentos já concluídos (DONE).",
    );
  }

  if (!appointment.service || !appointment.serviceId) {
    throw new Error("Serviço do agendamento não encontrado ao criar pedido.");
  }

  // ✅ obrigatório agora: Order precisa de unitId
  // usamos o unitId do próprio agendamento (fonte de verdade)
  if (!appointment.unitId) {
    throw new Error(
      "Agendamento sem unidade vinculada (unitId). Não é possível criar pedido.",
    );
  }

  const priceDecimal =
    appointment.servicePriceAtTheTime ??
    appointment.service.price ??
    new Prisma.Decimal(0);

  const order = await prisma.order.create({
    data: {
      clientId: appointment.clientId,
      appointmentId: appointment.id,
      barberId: appointment.barberId ?? null,
      status: "PENDING",
      totalAmount: priceDecimal,

      // ✅ fix do TS + regra multi-unidade
      unitId: appointment.unitId,

      items: {
        create: [
          {
            serviceId: appointment.serviceId,
            quantity: 1,
            unitPrice: priceDecimal,
            totalPrice: priceDecimal,
          },
        ],
      },
    },
  });

  return order;
}
