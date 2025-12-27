import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "../../../../lib/prisma";

type MobileTokenPayload = {
  sub: string;
  role?: "CLIENT" | "BARBER" | "ADMIN";
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

function getJwtSecretKey() {
  const secret = process.env.APP_JWT_SECRET;
  if (!secret) throw new Error("APP_JWT_SECRET não definido no .env");
  return new TextEncoder().encode(secret);
}

async function requireMobileAuth(req: Request): Promise<MobileTokenPayload> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new Error("Token ausente");
  const { payload } = await jwtVerify(token, getJwtSecretKey());
  return payload as unknown as MobileTokenPayload;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
  try {
    await requireMobileAuth(req);

    const url = new URL(req.url);
    const unitId = url.searchParams.get("unitId") ?? "";
    const serviceId = url.searchParams.get("serviceId") ?? "";

    if (!unitId || !serviceId) {
      return NextResponse.json(
        { error: "unitId e serviceId são obrigatórios" },
        { status: 400, headers: corsHeaders() },
      );
    }

    const rows = await prisma.barber.findMany({
      where: {
        isActive: true,
        units: {
          some: {
            unitId,
            isActive: true,
          },
        },
        services: {
          some: {
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
    const msg = String(err?.message ?? "Não autorizado");

    if (
      msg.toLowerCase().includes("token") ||
      msg.toLowerCase().includes("jwt") ||
      msg.toLowerCase().includes("signature")
    ) {
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
