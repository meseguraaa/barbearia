import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // ajuste o caminho se for diferente

// GET /api/services?active=true|false
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const activeParam = searchParams.get("active");

    const where =
      activeParam === null
        ? {} // não filtrou por active
        : { isActive: activeParam === "true" };

    const services = await prisma.service.findMany({
      where,
      orderBy: { name: "asc" },
    });

    return NextResponse.json(services, { status: 200 });
  } catch (error) {
    console.error("[GET /api/services] Error:", error);
    return NextResponse.json(
      { message: "Erro ao buscar serviços." },
      { status: 500 },
    );
  }
}

// POST /api/services
// body: { name: string; price: number; durationMinutes: number; isActive?: boolean }
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { name, price, durationMinutes, isActive = true } = body ?? {};

    // Validações básicas
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        {
          message:
            "Nome do serviço é obrigatório e deve ter pelo menos 2 caracteres.",
        },
        { status: 400 },
      );
    }

    if (
      price === undefined ||
      price === null ||
      isNaN(Number(price)) ||
      Number(price) <= 0
    ) {
      return NextResponse.json(
        {
          message: "Preço do serviço é obrigatório e deve ser maior que zero.",
        },
        { status: 400 },
      );
    }

    if (
      durationMinutes === undefined ||
      durationMinutes === null ||
      isNaN(Number(durationMinutes)) ||
      Number(durationMinutes) <= 0
    ) {
      return NextResponse.json(
        {
          message:
            "Duração (em minutos) é obrigatória e deve ser maior que zero.",
        },
        { status: 400 },
      );
    }

    const service = await prisma.service.create({
      data: {
        name: name.trim(),
        price: Number(price),
        durationMinutes: Number(durationMinutes),
        isActive: Boolean(isActive),
      },
    });

    return NextResponse.json(service, { status: 201 });
  } catch (error) {
    console.error("[POST /api/services] Error:", error);
    return NextResponse.json(
      { message: "Erro ao criar serviço." },
      { status: 500 },
    );
  }
}
