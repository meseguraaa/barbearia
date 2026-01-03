import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAppJwt } from "@/lib/app-jwt";

type MobileTokenPayload = {
  sub: string;
  role: "CLIENT" | "BARBER" | "ADMIN";
  companyId: string; // ✅ multi-tenant obrigatório
  profile_complete?: boolean;

  // compat (tokens antigos / logs). Não confie nisso pra auth.
  email?: string;
  name?: string | null;
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

async function requireMobileAuth(req: Request): Promise<MobileTokenPayload> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new Error("missing_token");

  const payload = await verifyAppJwt(token);
  return payload as MobileTokenPayload;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
  try {
    const payload = await requireMobileAuth(req);
    const companyId = payload.companyId;

    const url = new URL(req.url);
    const unitId = String(url.searchParams.get("unitId") ?? "").trim();
    const serviceId = String(url.searchParams.get("serviceId") ?? "").trim();

    if (!unitId || !serviceId) {
      return NextResponse.json(
        { error: "unitId e serviceId são obrigatórios" },
        { status: 400, headers: corsHeaders() },
      );
    }

    // ✅ valida unidade e serviço no tenant antes de listar
    const [unit, service] = await Promise.all([
      prisma.unit.findFirst({
        where: { id: unitId, companyId, isActive: true },
        select: { id: true },
      }),
      prisma.service.findFirst({
        where: { id: serviceId, companyId, isActive: true },
        select: { id: true },
      }),
    ]);

    if (!unit) {
      return NextResponse.json(
        { error: "Unidade não encontrada" },
        { status: 404, headers: corsHeaders() },
      );
    }

    if (!service) {
      return NextResponse.json(
        { error: "Serviço não encontrado" },
        { status: 404, headers: corsHeaders() },
      );
    }

    const rows = await prisma.barber.findMany({
      where: {
        companyId, // ✅ tenant scope
        isActive: true,
        units: {
          some: {
            companyId, // ✅ tenant scope
            unitId,
            isActive: true,
          },
        },
        services: {
          some: {
            companyId, // ✅ tenant scope
            serviceId,
          },
        },
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        imageUrl: true, // Barber.imageUrl (novo padrão)
        user: {
          select: {
            image: true, // User.image (legado / admin)
          },
        },
      },
    });

    // ✅ normaliza imagem (novo -> legado)
    const barbers = rows.map((b) => ({
      id: b.id,
      name: b.name,
      imageUrl: b.imageUrl ?? b.user?.image ?? null,
    }));

    return NextResponse.json(
      { ok: true, barbers },
      { status: 200, headers: corsHeaders() },
    );
  } catch (err: any) {
    const msg = String(err?.message ?? "");

    const isAuth =
      msg === "missing_token" ||
      msg.includes("Invalid token payload") ||
      msg.toLowerCase().includes("jwt") ||
      msg.toLowerCase().includes("token");

    if (isAuth) {
      return NextResponse.json(
        { error: "Não autorizado" },
        { status: 401, headers: corsHeaders() },
      );
    }

    console.error("[mobile/barbers] error:", err);
    return NextResponse.json(
      { error: "Erro ao listar profissionais" },
      { status: 500, headers: corsHeaders() },
    );
  }
}
