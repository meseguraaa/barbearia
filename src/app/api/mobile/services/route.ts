import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type MobileTokenPayload = {
  sub: string;
  role?: "CLIENT" | "BARBER" | "ADMIN";
  companyId: string; // ✅ multi-tenant obrigatório
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

  const sub = String((payload as any)?.sub || "").trim();
  if (!sub) throw new Error("Token inválido");

  const companyId =
    typeof (payload as any)?.companyId === "string"
      ? String((payload as any).companyId).trim()
      : "";
  if (!companyId) throw new Error("companyId ausente no token");

  return {
    sub,
    role: (payload as any).role,
    companyId,
  };
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
    const auth = await requireMobileAuth(req);
    const companyId = auth.companyId;

    const url = new URL(req.url);
    const unitId = String(url.searchParams.get("unitId") || "").trim();

    if (!unitId) {
      return NextResponse.json(
        { error: "unitId é obrigatório" },
        { status: 400, headers: corsHeaders() },
      );
    }

    // ✅ 0) valida que a unit pertence ao tenant
    const unit = await prisma.unit.findFirst({
      where: { id: unitId, companyId, isActive: true },
      select: { id: true },
    });

    if (!unit) {
      return NextResponse.json(
        { error: "Unidade inválida" },
        { status: 404, headers: corsHeaders() },
      );
    }

    // ✅ 1) barbeiros ativos vinculados à unidade (tenant-safe)
    const unitBarbers = await prisma.barberUnit.findMany({
      where: {
        companyId, // ✅ garante vínculo do tenant (se existir no schema)
        unitId,
        isActive: true,
        barber: {
          companyId, // ✅ garante barbeiro do mesmo tenant
          isActive: true,
        } as any,
      } as any,
      select: { barberId: true },
    });

    const barberIds = Array.from(new Set(unitBarbers.map((b) => b.barberId)))
      .filter(Boolean)
      .map((x) => String(x));

    if (barberIds.length === 0) {
      return NextResponse.json(
        { ok: true, services: [] },
        { status: 200, headers: corsHeaders() },
      );
    }

    // ✅ 2) serviços que esses barbeiros executam (tenant-safe)
    const serviceLinks = await prisma.serviceProfessional.findMany({
      where: {
        companyId, // ✅ se existir no schema
        barberId: { in: barberIds },
        service: { companyId } as any, // ✅ garante service do mesmo tenant
      } as any,
      select: { serviceId: true },
    });

    const serviceIds = Array.from(new Set(serviceLinks.map((s) => s.serviceId)))
      .filter(Boolean)
      .map((x) => String(x));

    if (serviceIds.length === 0) {
      return NextResponse.json(
        { ok: true, services: [] },
        { status: 200, headers: corsHeaders() },
      );
    }

    // ✅ 3) serviços ativos (tenant-safe)
    const services = await prisma.service.findMany({
      where: {
        companyId,
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

    const payload = services.map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.durationMinutes ?? 0,
      price: moneyBRLFromDecimal(s.price),
      cancelFeePercentage:
        s.cancelFeePercentage == null ? null : toNumber(s.cancelFeePercentage),
      cancelLimitHours: s.cancelLimitHours ?? null,
    }));

    return NextResponse.json(
      { ok: true, services: payload },
      { status: 200, headers: corsHeaders() },
    );
  } catch (err: any) {
    const msg = String(err?.message ?? "Não autorizado");
    const lower = msg.toLowerCase();

    if (
      lower.includes("token") ||
      lower.includes("jwt") ||
      lower.includes("signature") ||
      lower.includes("companyid")
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
