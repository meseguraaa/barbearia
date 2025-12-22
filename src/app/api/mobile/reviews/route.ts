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
  appointmentId: z.string().min(1, "Atendimento é obrigatório"),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000, "Comentário muito longo").optional().nullable(),
  tagIds: z.array(z.string()).max(3).optional().default([]),
  isAnonymousForProfessional: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  try {
    const payload = await requireMobileAuth(req);
    const userId = payload.sub;

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Dados inválidos ao criar avaliação." },
        { status: 400, headers: corsHeaders() },
      );
    }

    const {
      appointmentId,
      rating,
      comment,
      tagIds,
      isAnonymousForProfessional,
    } = parsed.data;

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { review: true },
    });

    if (!appointment) {
      return NextResponse.json(
        { ok: false, error: "Atendimento não encontrado." },
        { status: 404, headers: corsHeaders() },
      );
    }

    if (appointment.clientId !== userId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Você não pode avaliar um atendimento de outro cliente.",
        },
        { status: 403, headers: corsHeaders() },
      );
    }

    if (appointment.status !== "DONE") {
      return NextResponse.json(
        { ok: false, error: "Só é possível avaliar atendimentos concluídos." },
        { status: 400, headers: corsHeaders() },
      );
    }

    if (!appointment.barberId) {
      return NextResponse.json(
        { ok: false, error: "Atendimento sem profissional associado." },
        { status: 400, headers: corsHeaders() },
      );
    }

    if (appointment.review) {
      return NextResponse.json(
        { ok: false, error: "Este atendimento já foi avaliado." },
        { status: 409, headers: corsHeaders() },
      );
    }

    // garante no máximo 3 tags únicas
    const uniqueTagIds = Array.from(new Set(tagIds ?? [])).slice(0, 3);

    await prisma.$transaction(async (tx) => {
      const review = await tx.appointmentReview.create({
        data: {
          appointmentId: appointment.id,
          clientId: userId,
          barberId: appointment.barberId!,
          rating,
          comment: comment ?? undefined,
          isAnonymousForProfessional,
        },
      });

      if (uniqueTagIds.length > 0) {
        // usa só tags ativas e existentes
        const validTags = await tx.reviewTag.findMany({
          where: {
            id: { in: uniqueTagIds },
            isActive: true,
          },
          select: { id: true },
        });

        if (validTags.length > 0) {
          await tx.appointmentReviewTag.createMany({
            data: validTags.map((tag) => ({
              reviewId: review.id,
              tagId: tag.id,
            })),
          });
        }
      }

      // depois de avaliar, mata a pendência
      await tx.appointment.update({
        where: { id: appointment.id },
        data: { reviewModalShown: true },
      });

      // idempotência de transação
      await tx.$executeRaw`SELECT 1`;
    });

    return NextResponse.json({ ok: true }, { headers: corsHeaders() });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? "Erro ao salvar sua avaliação. Tente novamente.",
      },
      { status: 500, headers: corsHeaders() },
    );
  }
}
