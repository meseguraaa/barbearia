import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// No Next 15, `params` vem como Promise
type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

// PUT /api/services/:id
// body (parcial): { name?: string; price?: number; durationMinutes?: number; isActive?: boolean }
export async function PUT(request: Request, context: RouteContext) {
  // ✅ Agora usamos await no params
  const { id } = await context.params;

  try {
    const body = await request.json();
    console.log("[PUT /api/services]", { id, body });

    const { name, price, durationMinutes, isActive } = body ?? {};

    const data: any = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length < 2) {
        return NextResponse.json(
          { message: "Nome do serviço deve ter pelo menos 2 caracteres." },
          { status: 400 },
        );
      }
      data.name = name.trim();
    }

    if (price !== undefined) {
      if (isNaN(Number(price)) || Number(price) <= 0) {
        return NextResponse.json(
          { message: "Preço deve ser um número maior que zero." },
          { status: 400 },
        );
      }
      data.price = Number(price);
    }

    if (durationMinutes !== undefined) {
      if (isNaN(Number(durationMinutes)) || Number(durationMinutes) <= 0) {
        return NextResponse.json(
          { message: "Duração deve ser um número maior que zero." },
          { status: 400 },
        );
      }
      data.durationMinutes = Number(durationMinutes);
    }

    if (isActive !== undefined) {
      data.isActive = Boolean(isActive);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { message: "Nenhum campo para atualizar foi enviado." },
        { status: 400 },
      );
    }

    const updated = await prisma.service.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error: any) {
    console.error(`[PUT /api/services/${id}] Error:`, error);

    // Prisma manda P2025 quando não encontra o registro
    if (error?.code === "P2025") {
      return NextResponse.json(
        { message: "Serviço não encontrado." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { message: "Erro ao atualizar serviço." },
      { status: 500 },
    );
  }
}

// DELETE /api/services/:id
// Soft delete: marca isActive = false
export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const updated = await prisma.service.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json(
      { message: "Serviço desativado com sucesso.", service: updated },
      { status: 200 },
    );
  } catch (error: any) {
    console.error(`[DELETE /api/services/${id}] Error:`, error);

    if (error?.code === "P2025") {
      return NextResponse.json(
        { message: "Serviço não encontrado." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { message: "Erro ao desativar serviço." },
      { status: 500 },
    );
  }
}
