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

  // ✅ multi-tenant: companyId obrigatório para criar Order/OrderItem
  const companyId = (appointment as any).companyId as string | undefined;
  if (!companyId) {
    // fallback: tenta pegar da service (caso seu schema não tenha companyId no appointment)
    const fallbackCompanyId = (appointment.service as any)?.companyId as
      | string
      | undefined;

    if (!fallbackCompanyId) {
      throw new Error(
        "Agendamento sem companyId (multi-tenant). Não é possível criar pedido.",
      );
    }

    // se cair aqui, usamos o companyId da service
    return await createOrderForAppointmentWithCompanyId({
      appointment,
      companyId: fallbackCompanyId,
    });
  }

  return await createOrderForAppointmentWithCompanyId({
    appointment,
    companyId,
  });
}

async function createOrderForAppointmentWithCompanyId(args: {
  appointment: any;
  companyId: string;
}) {
  const { appointment, companyId } = args;

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
      companyId, // ✅ multi-tenant (provável obrigatório)
      clientId: appointment.clientId,
      appointmentId: appointment.id,
      barberId: appointment.barberId ?? null,
      status: "PENDING",
      totalAmount: priceDecimal,

      // ✅ regra multi-unidade
      unitId: appointment.unitId,

      items: {
        create: [
          {
            companyId, // ✅ FIX do erro TS2741 (campo obrigatório)
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
