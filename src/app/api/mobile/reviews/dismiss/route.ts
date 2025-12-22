import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

type MobileTokenPayload = {
  sub: string;
  role?: "CLIENT" | "BARBER" | "ADMIN";
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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
  return payload as any;
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

const schema = z.object({
  appointmentId: z.string().min(1, "appointmentId é obrigatório"),
});

export async function POST(req: Request) {
  try {
    const payload = await requireMobileAuth(req);
    const userId = payload.sub;

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Dados inválidos." },
        { status: 400, headers: corsHeaders() },
      );
    }

    const { appointmentId } = parsed.data;

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
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
        { status: 404, headers: corsHeaders() },
      );
    }

    if (appointment.clientId !== userId) {
      return NextResponse.json(
        { ok: false, error: "Você não pode alterar esse atendimento." },
        { status: 403, headers: corsHeaders() },
      );
    }

    // Se já tem review, não faz nada
    if (appointment.review) {
      return NextResponse.json({ ok: true }, { headers: corsHeaders() });
    }

    // Se já estava marcado, beleza
    if (appointment.reviewModalShown) {
      return NextResponse.json({ ok: true }, { headers: corsHeaders() });
    }

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { reviewModalShown: true },
    });

    return NextResponse.json({ ok: true }, { headers: corsHeaders() });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? "Erro ao atualizar. Tente novamente.",
      },
      { status: 500, headers: corsHeaders() },
    );
  }
}
