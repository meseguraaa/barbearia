import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "../../../../lib/prisma";
import { Prisma } from "@prisma/client";

type MobileTokenPayload = {
  sub: string;
  role?: "CLIENT" | "BARBER" | "ADMIN";
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

function toNumber(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v?.toNumber === "function") return v.toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function moneyBRLFromDecimal(v: any): string {
  const n = toNumber(v);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
  try {
    await requireMobileAuth(req);

    const url = new URL(req.url);
    const unitId = url.searchParams.get("unitId") || "";

    if (!unitId) {
      return NextResponse.json(
        { error: "unitId é obrigatório" },
        { status: 400, headers: corsHeaders() },
      );
    }

    // 1) Barbeiros ativos vinculados à unidade
    const unitBarbers = await prisma.barberUnit.findMany({
      where: {
        unitId,
        isActive: true,
        barber: { isActive: true },
      },
      select: { barberId: true },
    });

    const barberIds = Array.from(
      new Set(unitBarbers.map((b) => b.barberId)),
    ).filter(Boolean);

    if (barberIds.length === 0) {
      return NextResponse.json(
        { ok: true, services: [] },
        { status: 200, headers: corsHeaders() },
      );
    }

    // 2) Serviços que esses barbeiros executam
    const serviceLinks = await prisma.serviceProfessional.findMany({
      where: { barberId: { in: barberIds } },
      select: { serviceId: true },
    });

    const serviceIds = Array.from(
      new Set(serviceLinks.map((s) => s.serviceId)),
    ).filter(Boolean);

    if (serviceIds.length === 0) {
      return NextResponse.json(
        { ok: true, services: [] },
        { status: 200, headers: corsHeaders() },
      );
    }

    // 3) Serviços ativos (ordem alfabética)
    const services = await prisma.service.findMany({
      where: {
        id: { in: serviceIds },
        isActive: true,
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        durationMinutes: true,
        price: true,
        cancelFeePercentage: true,
        cancelLimitHours: true,
      },
    });

    // payload amigável pro mobile
    const payload = services.map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.durationMinutes ?? 0,
      price: moneyBRLFromDecimal(s.price),
      // se quiser usar depois no app:
      cancelFeePercentage: s.cancelFeePercentage
        ? toNumber(s.cancelFeePercentage)
        : null,
      cancelLimitHours: s.cancelLimitHours ?? null,
    }));

    return NextResponse.json(
      { ok: true, services: payload },
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

    console.error("[mobile/services] error:", err);
    return NextResponse.json(
      { error: "Erro ao listar serviços" },
      { status: 500, headers: corsHeaders() },
    );
  }
}
