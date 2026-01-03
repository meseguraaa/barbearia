import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

type MobileTokenPayload = {
  sub: string;
  role?: "CLIENT" | "BARBER" | "ADMIN";
  companyId: string; // ✅ multi-tenant obrigatório
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    // ✅ inclui x-company-id pra padronizar teu app inteiro
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-company-id",
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

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

const schema = z.object({
  appointmentId: z.string().min(1, "appointmentId é obrigatório"),
});

export async function POST(req: Request) {
  const headers = corsHeaders();

  try {
    const payload = await requireMobileAuth(req);

    // ✅ endpoint pensado para CLIENT
    if (payload.role && payload.role !== "CLIENT") {
      return NextResponse.json(
        { ok: false, error: "Sem permissão." },
        { status: 403, headers },
      );
    }

    const userId = payload.sub;
    const companyId = payload.companyId;

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Dados inválidos." },
        { status: 400, headers },
      );
    }

    const { appointmentId } = parsed.data;

    // ✅ tenant-safe: appointment tem que ser do mesmo companyId
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, companyId },
      select: {
        id: true,
        clientId: true,
        status: true,
        reviewModalShown: true,
        review: { select: { id: true } },
      },
    });

    if (!appointment) {
      return NextResponse.json(
        { ok: false, error: "Atendimento não encontrado." },
        { status: 404, headers },
      );
    }

    if (appointment.clientId !== userId) {
      return NextResponse.json(
        { ok: false, error: "Você não pode alterar esse atendimento." },
        { status: 403, headers },
      );
    }

    // (opcional) se quiser travar só pra DONE, descomenta:
    // if (String(appointment.status).toUpperCase() !== "DONE") {
    //   return NextResponse.json(
    //     { ok: false, error: "Atendimento ainda não concluído." },
    //     { status: 400, headers }
    //   );
    // }

    // ✅ Se já tem review, idempotente
    if (appointment.review) {
      const res = NextResponse.json({ ok: true }, { headers });
      res.headers.set("x-company-id", companyId);
      return res;
    }

    // ✅ Se já estava marcado, idempotente
    if (appointment.reviewModalShown) {
      const res = NextResponse.json({ ok: true }, { headers });
      res.headers.set("x-company-id", companyId);
      return res;
    }

    // ✅ update com guarda de tenant (evita cross-tenant por id)
    await prisma.appointment.updateMany({
      where: { id: appointment.id, companyId, clientId: userId },
      data: { reviewModalShown: true },
    });

    const res = NextResponse.json({ ok: true }, { headers });
    res.headers.set("x-company-id", companyId);
    return res;
  } catch (err: any) {
    const msg = String(err?.message ?? "Erro ao atualizar. Tente novamente.");
    const lower = msg.toLowerCase();

    const isAuth =
      lower.includes("token") ||
      lower.includes("jwt") ||
      lower.includes("signature") ||
      lower.includes("companyid");

    return NextResponse.json(
      { ok: false, error: isAuth ? "Não autorizado" : msg },
      { status: isAuth ? 401 : 500, headers },
    );
  }
}
