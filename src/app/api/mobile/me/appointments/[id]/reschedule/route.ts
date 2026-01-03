import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAppJwt } from "@/lib/app-jwt";

type MobileTokenPayload = {
  sub: string;
  role?: "CLIENT" | "BARBER" | "ADMIN";
  companyId: string; // ✅ multi-tenant obrigatório
};

const DEFAULT_RESCHEDULE_WINDOW_HOURS = 24;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

async function requireMobileAuth(req: Request): Promise<MobileTokenPayload> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new Error("missing_token");

  const payload = (await verifyAppJwt(token)) as any;

  const companyId =
    typeof payload?.companyId === "string"
      ? String(payload.companyId).trim()
      : "";

  if (!companyId) throw new Error("missing_company_id");

  return { ...(payload as any), companyId } as MobileTokenPayload;
}

function normalizeWindowHours(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;

  // proteção: limite superior razoável (30 dias)
  if (n > 24 * 30) return 24 * 30;
  return n;
}

function computeCanReschedule(scheduleAt: Date, windowHours: number) {
  const now = new Date();
  const diffMs = scheduleAt.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours >= windowHours;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const payload = await requireMobileAuth(req);
    const companyId = payload.companyId;

    if (payload.role && payload.role !== "CLIENT") {
      return NextResponse.json(
        { error: "Sem permissão" },
        { status: 403, headers: corsHeaders() },
      );
    }

    const { id } = await params;
    const apptId = String(id || "").trim();
    if (!apptId) {
      return NextResponse.json(
        { error: "Id ausente" },
        { status: 400, headers: corsHeaders() },
      );
    }

    const body = await req.json().catch(() => ({}) as any);
    const unitId = String((body as any)?.unitId ?? "").trim();
    const serviceId = (body as any)?.serviceId
      ? String((body as any).serviceId).trim()
      : "";
    const barberId = (body as any)?.barberId
      ? String((body as any).barberId).trim()
      : "";
    const scheduleAtRaw = String((body as any)?.scheduleAt ?? "").trim();
    const scheduleAt = scheduleAtRaw ? new Date(scheduleAtRaw) : null;

    if (
      !unitId ||
      !serviceId ||
      !barberId ||
      !scheduleAt ||
      Number.isNaN(scheduleAt.getTime())
    ) {
      return NextResponse.json(
        { error: "Parâmetros incompletos" },
        { status: 400, headers: corsHeaders() },
      );
    }

    // ✅ não permite reagendar para o passado
    if (scheduleAt.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "Não é possível reagendar para um horário no passado." },
        { status: 400, headers: corsHeaders() },
      );
    }

    // ✅ valida unit/service/barber no tenant antes de qualquer update
    const [unit, nextService, barberUnit, sp] = await Promise.all([
      prisma.unit.findFirst({
        where: { id: unitId, companyId, isActive: true },
        select: { id: true },
      }),
      prisma.service.findFirst({
        where: { id: serviceId, companyId, isActive: true },
        select: { id: true, name: true },
      }),
      prisma.barberUnit.findFirst({
        where: { companyId, unitId, barberId, isActive: true },
        select: { id: true },
      }),
      prisma.serviceProfessional.findFirst({
        where: { companyId, serviceId, barberId },
        select: { id: true },
      }),
    ]);

    if (!unit) {
      return NextResponse.json(
        { error: "Unidade inválida" },
        { status: 400, headers: corsHeaders() },
      );
    }

    if (!nextService) {
      return NextResponse.json(
        { error: "Serviço inválido" },
        { status: 400, headers: corsHeaders() },
      );
    }

    if (!barberUnit) {
      return NextResponse.json(
        { error: "Profissional não vinculado a esta unidade" },
        { status: 400, headers: corsHeaders() },
      );
    }

    if (!sp) {
      return NextResponse.json(
        { error: "Profissional não executa este serviço" },
        { status: 400, headers: corsHeaders() },
      );
    }

    // 1) carrega o agendamento atual (tenant-safe) pra validar janela
    const current = await prisma.appointment.findFirst({
      where: {
        id: apptId,
        companyId, // ✅ tenant scope
        clientId: payload.sub,
        status: { not: "CANCELED" },
      },
      select: {
        id: true,
        scheduleAt: true,
        service: {
          select: {
            cancelLimitHours: true, // (usado como janela de reagendamento aqui)
          },
        },
      },
    });

    if (!current) {
      return NextResponse.json(
        { error: "Agendamento não encontrado" },
        { status: 404, headers: corsHeaders() },
      );
    }

    const now = new Date();
    if (current.scheduleAt.getTime() <= now.getTime()) {
      return NextResponse.json(
        { error: "Agendamento já começou ou já passou." },
        { status: 400, headers: corsHeaders() },
      );
    }

    // 2) janela configurável por serviço (baseada no serviço ATUAL do agendamento)
    const windowHours =
      normalizeWindowHours(current.service?.cancelLimitHours) ??
      DEFAULT_RESCHEDULE_WINDOW_HOURS;

    if (!computeCanReschedule(current.scheduleAt, windowHours)) {
      return NextResponse.json(
        {
          error: `Não é possível alterar com menos de ${windowHours}h de antecedência.`,
        },
        { status: 400, headers: corsHeaders() },
      );
    }

    // 3) conflito de horário (regra atual: mesmo scheduleAt)
    // ✅ tenant-safe + evita travar na própria edição
    const conflict = await prisma.appointment.findFirst({
      where: {
        companyId, // ✅ tenant scope
        id: { not: apptId },
        barberId,
        status: { not: "CANCELED" },
        scheduleAt,
      },
      select: { id: true },
    });

    if (conflict) {
      return NextResponse.json(
        { error: "Esse horário não está mais disponível." },
        { status: 409, headers: corsHeaders() },
      );
    }

    // 4) update blindado: reforça tenant + dono (e status) no write
    const updated = await prisma.appointment.updateMany({
      where: {
        id: apptId,
        companyId,
        clientId: payload.sub,
        status: { not: "CANCELED" },
      },
      data: {
        unitId,
        serviceId,
        barberId,
        scheduleAt,

        // ✅ reflete no admin/web (descrição do serviço)
        description: nextService.name,
      },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { error: "Agendamento não encontrado" },
        { status: 404, headers: corsHeaders() },
      );
    }

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: corsHeaders() },
    );
  } catch (err: any) {
    const msg = String(err?.message ?? "Erro");

    const isAuth =
      msg === "missing_token" ||
      msg === "missing_company_id" ||
      msg.includes("Invalid token payload") ||
      msg.toLowerCase().includes("jwt") ||
      msg.toLowerCase().includes("token") ||
      msg.toLowerCase().includes("signature") ||
      msg.toLowerCase().includes("companyid");

    if (isAuth) {
      return NextResponse.json(
        { error: "Não autorizado" },
        { status: 401, headers: corsHeaders() },
      );
    }

    console.error("[mobile/me/appointments/[id]/reschedule POST] error:", err);
    return NextResponse.json(
      { error: "Erro ao alterar agendamento" },
      { status: 500, headers: corsHeaders() },
    );
  }
}
