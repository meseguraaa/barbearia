import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { addMinutes } from "date-fns";
import { Prisma } from "@prisma/client";

type MobileTokenPayload = {
  sub: string;
  role?: "CLIENT" | "BARBER" | "ADMIN";
  email?: string;
  name?: string | null;
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
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

/**
 * dateISO: "2025-12-20T15:00:00.000Z" (do day picker, meio-dia)
 * startTime: "09:30"
 */
function buildScheduleAtSaoPaulo(dateISO: string, startTime: string): Date {
  const date = new Date(dateISO);
  if (Number.isNaN(date.getTime())) throw new Error("dateISO inválido");

  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");

  const hhmm = String(startTime || "").trim();
  if (!/^\d{2}:\d{2}$/.test(hhmm)) throw new Error("startTime inválido");

  const iso = `${yyyy}-${mm}-${dd}T${hhmm}:00-03:00`;
  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) throw new Error("Falha ao montar scheduleAt");
  return d;
}

function normalizePhone(phone: string): string {
  return String(phone ?? "").replace(/\D/g, "");
}

function isValidPhoneDigits(phoneDigits: string): boolean {
  return phoneDigits.length === 10 || phoneDigits.length === 11;
}

function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

async function ensureAvailability(
  scheduleAt: Date,
  barberId: string,
  durationMinutes: number,
): Promise<string | null> {
  const newStart = scheduleAt;
  const newEnd = addMinutes(scheduleAt, Math.max(0, durationMinutes || 0));

  const windowStart = addMinutes(newStart, -12 * 60);
  const windowEnd = addMinutes(newEnd, 12 * 60);

  const candidates = await prisma.appointment.findMany({
    where: {
      barberId,
      status: { not: "CANCELED" },
      scheduleAt: { gte: windowStart, lte: windowEnd },
    },
    select: {
      id: true,
      scheduleAt: true,
      service: { select: { durationMinutes: true } },
    },
    orderBy: { scheduleAt: "asc" },
  });

  for (const appt of candidates) {
    const existingStart = appt.scheduleAt;
    const existingEnd = addMinutes(
      existingStart,
      Math.max(0, appt.service?.durationMinutes ?? 0),
    );

    if (intervalsOverlap(existingStart, existingEnd, newStart, newEnd)) {
      return "Este profissional já possui um agendamento que conflita com este horário";
    }
  }

  return null;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: Request) {
  try {
    const payload = await requireMobileAuth(req);

    if (payload.role && payload.role !== "CLIENT") {
      return NextResponse.json(
        { error: "Sem permissão" },
        { status: 403, headers: corsHeaders() },
      );
    }

    const body = await req.json();

    const clientName = String(body?.clientName ?? "").trim();
    const phoneRaw = String(body?.phone ?? "");
    const phone = normalizePhone(phoneRaw);

    const unitId = String(body?.unitId ?? "").trim();
    const serviceId = String(body?.serviceId ?? "").trim();
    const barberId = String(body?.barberId ?? "").trim();

    // ✅ agora aceitamos scheduleAt OU dateISO+startTime
    const scheduleAtRaw = String(body?.scheduleAt ?? "").trim();
    const dateISO = String(body?.dateISO ?? "").trim();
    const startTime = String(body?.startTime ?? "").trim();

    if (!clientName) {
      return NextResponse.json(
        { error: "Nome é obrigatório" },
        { status: 400, headers: corsHeaders() },
      );
    }

    if (!phone || !isValidPhoneDigits(phone)) {
      return NextResponse.json(
        { error: "Telefone inválido (use DDD + número)" },
        { status: 400, headers: corsHeaders() },
      );
    }

    if (!unitId || !serviceId || !barberId) {
      return NextResponse.json(
        { error: "Parâmetros incompletos" },
        { status: 400, headers: corsHeaders() },
      );
    }

    // ✅ decide scheduleAt
    let scheduleAt: Date | null = null;

    if (scheduleAtRaw) {
      const d = new Date(scheduleAtRaw);
      if (!Number.isNaN(d.getTime())) scheduleAt = d;
    }

    if (!scheduleAt) {
      if (!dateISO || !startTime) {
        return NextResponse.json(
          { error: "Parâmetros incompletos" },
          { status: 400, headers: corsHeaders() },
        );
      }
      scheduleAt = buildScheduleAtSaoPaulo(dateISO, startTime);
    }

    if (scheduleAt.getTime() < Date.now()) {
      return NextResponse.json(
        { error: "Não é possível agendar para um horário no passado" },
        { status: 400, headers: corsHeaders() },
      );
    }

    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
      select: { id: true, isActive: true },
    });
    if (!unit) {
      return NextResponse.json(
        { error: "Unidade não encontrada" },
        { status: 404, headers: corsHeaders() },
      );
    }
    if (unit.isActive === false) {
      return NextResponse.json(
        { error: "Unidade inativa" },
        { status: 400, headers: corsHeaders() },
      );
    }

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: {
        id: true,
        name: true,
        price: true,
        barberPercentage: true,
        isActive: true,
        durationMinutes: true,
      },
    });
    if (!service) {
      return NextResponse.json(
        { error: "Serviço não encontrado" },
        { status: 404, headers: corsHeaders() },
      );
    }
    if (!service.isActive) {
      return NextResponse.json(
        { error: "Serviço inativo" },
        { status: 400, headers: corsHeaders() },
      );
    }

    const barberUnit = await prisma.barberUnit.findFirst({
      where: { barberId, unitId, isActive: true },
      select: { id: true },
    });
    if (!barberUnit) {
      return NextResponse.json(
        { error: "Este profissional não está vinculado a esta unidade" },
        { status: 400, headers: corsHeaders() },
      );
    }

    const sp = await prisma.serviceProfessional.findFirst({
      where: { barberId, serviceId },
      select: { id: true },
    });
    if (!sp) {
      return NextResponse.json(
        { error: "Este profissional não executa este serviço" },
        { status: 400, headers: corsHeaders() },
      );
    }

    const conflict = await ensureAvailability(
      scheduleAt,
      barberId,
      service.durationMinutes ?? 0,
    );
    if (conflict) {
      return NextResponse.json(
        { error: conflict },
        { status: 409, headers: corsHeaders() },
      );
    }

    const clientId = payload.sub;

    const barberEarningValue = service.price
      .mul(service.barberPercentage)
      .div(new Prisma.Decimal(100));

    const appointment = await prisma.appointment.create({
      data: {
        clientName,
        phone,
        description: service.name,
        scheduleAt,

        serviceId,
        barberId,
        unitId,
        clientId,

        servicePriceAtTheTime: service.price,
        barberPercentageAtTheTime: service.barberPercentage,
        barberEarningValue,
        status: "PENDING",
      },
      select: {
        id: true,
        status: true,
        scheduleAt: true,
      },
    });

    return NextResponse.json(
      { ok: true, appointment },
      { status: 200, headers: corsHeaders() },
    );
  } catch (err: any) {
    const msg = String(err?.message ?? "Erro");

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

    console.error("[api/mobile/appointments] error:", err);
    return NextResponse.json(
      { error: "Erro ao criar agendamento" },
      { status: 500, headers: corsHeaders() },
    );
  }
}
