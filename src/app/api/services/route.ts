// src/app/api/services/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// helper: pega unitId do body ou fallback da primeira unidade
async function resolveUnitId(input: unknown): Promise<string> {
  const maybe =
    input && typeof input === "object" && "unitId" in (input as any)
      ? String((input as any).unitId ?? "").trim()
      : "";

  if (maybe) return maybe;

  const unit =
    (await prisma.unit.findFirst({
      where: { isActive: true },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    })) ??
    (await prisma.unit.findFirst({
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

async function resolveCompanyIdFromUnit(unitId: string): Promise<string> {
  const unit = await prisma.unit.findFirst({
    where: { id: unitId },
    select: { companyId: true },
  });

  const companyId = String(unit?.companyId ?? "").trim();
  if (!companyId) {
    throw new Error(
      "Unidade inválida ou sem companyId (multi-tenant). Não é possível criar serviço.",
    );
  }

  return companyId;
}

// GET /api/services?active=true|false&unitId=...
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const activeParam = searchParams.get("active");
    const unitIdParam = String(searchParams.get("unitId") ?? "").trim();

    const where: any =
      activeParam === null ? {} : { isActive: activeParam === "true" };

    // opcional: filtra por unidade se vier
    if (unitIdParam) {
      where.unitId = unitIdParam;
      // se quiser deixar ainda mais "tenant-safe", dá pra filtrar por companyId aqui também
      // (mas pra isso a gente teria que buscar unit->companyId; pode ser caro em GET sem necessidade)
    }

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
// body: { name: string; price: number; durationMinutes: number; isActive?: boolean; unitId?: string }
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

    const unitId = await resolveUnitId(body);
    const companyId = await resolveCompanyIdFromUnit(unitId);

    const service = await prisma.service.create({
      data: {
        name: name.trim(),
        price: Number(price),
        durationMinutes: Number(durationMinutes),
        isActive: Boolean(isActive),

        // ✅ obrigatório agora
        unit: { connect: { id: unitId } },

        // ✅ multi-tenant: Prisma está exigindo "company" (ou companyId)
        company: { connect: { id: companyId } },
        // Se no seu schema for companyId direto, troque por:
        // companyId,
      },
    });

    return NextResponse.json(service, { status: 201 });
  } catch (error) {
    console.error("[POST /api/services] Error:", error);

    // se estourar por falta de unidade/tenant, devolve msg útil
    const msg =
      error instanceof Error &&
      (error.message.includes("Nenhuma unidade") ||
        error.message.includes("companyId") ||
        error.message.includes("Unidade inválida"))
        ? error.message
        : "Erro ao criar serviço.";

    // aqui é 500 mesmo (erro de infra/consistência), mas se preferir 400 quando for validação:
    // return NextResponse.json({ message: msg }, { status: 400 });
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
