// src/app/client/reviews/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { nextAuthOptions } from "@/lib/nextauth";
import { revalidatePath } from "next/cache";
import z from "zod";

const createAppointmentReviewSchema = z.object({
  appointmentId: z.string().min(1, "Atendimento é obrigatório"),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().max(1000, "Comentário muito longo").optional().nullable(),
  tagIds: z.array(z.string()).max(3).optional().default([]),
  isAnonymousForProfessional: z.boolean().optional().default(false),
});

type CreateAppointmentReviewResult =
  | { success: true }
  | { success: false; error: string };

export async function createAppointmentReviewAction(
  formData: FormData,
): Promise<CreateAppointmentReviewResult> {
  try {
    const session = await getServerSession(nextAuthOptions);
    const userId = (session?.user as any)?.id as string | undefined;

    if (!userId) {
      return {
        success: false,
        error: "Você precisa estar logado para avaliar um atendimento.",
      };
    }

    // Pega múltiplas tags: <input name="tagIds" value="...">
    const rawTagIds = formData.getAll("tagIds");

    const raw = {
      appointmentId: formData.get("appointmentId"),
      rating: formData.get("rating"),
      comment: formData.get("comment"),
      isAnonymousForProfessional: formData.get("isAnonymousForProfessional"),
      tagIds: rawTagIds.map((v) => String(v)),
    };

    const parsed = createAppointmentReviewSchema.safeParse({
      ...raw,
      isAnonymousForProfessional:
        raw.isAnonymousForProfessional === "on" ||
        raw.isAnonymousForProfessional === "true",
    });

    if (!parsed.success) {
      console.error(parsed.error.flatten().fieldErrors);
      return {
        success: false,
        error: "Dados inválidos ao criar avaliação.",
      };
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
      include: {
        review: true,
      },
    });

    if (!appointment) {
      return { success: false, error: "Atendimento não encontrado." };
    }

    // ✅ multi-tenant: precisamos do companyId para criar o review
    const companyId = (appointment as any).companyId as string | undefined;
    if (!companyId) {
      return {
        success: false,
        error: "Atendimento sem companyId (multi-tenant).",
      };
    }

    if (appointment.clientId !== userId) {
      return {
        success: false,
        error: "Você não pode avaliar um atendimento de outro cliente.",
      };
    }

    if (appointment.status !== "DONE") {
      return {
        success: false,
        error: "Só é possível avaliar atendimentos concluídos.",
      };
    }

    if (!appointment.barberId) {
      return {
        success: false,
        error: "Atendimento sem profissional associado.",
      };
    }

    if (appointment.review) {
      return {
        success: false,
        error: "Este atendimento já foi avaliado.",
      };
    }

    // Garante no máximo 3 tags únicas
    const uniqueTagIds = Array.from(new Set(tagIds ?? [])).slice(0, 3);

    await prisma.$transaction(async (tx) => {
      const review = await tx.appointmentReview.create({
        data: {
          companyId, // ✅ FIX do erro TS2322 (campo obrigatório)
          appointmentId: appointment.id,
          clientId: userId,
          barberId: appointment.barberId!,
          rating,
          comment: comment ?? undefined,
          isAnonymousForProfessional,
        },
      });

      if (uniqueTagIds.length > 0) {
        // ✅ multi-tenant: só usa tags ativas da mesma empresa
        const validTags = await tx.reviewTag.findMany({
          where: {
            id: { in: uniqueTagIds },
            isActive: true,
            companyId,
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

      // Se quiser fazer algo extra dentro da transação, fica aqui.
      await tx.$executeRaw`SELECT 1`;
    });

    // Revalida páginas que usam histórico do cliente / dashboards
    revalidatePath("/client/history");
    // futuramente: revalidatePath("/admin"); revalidatePath("/barber/earnings"); etc.

    return { success: true };
  } catch (err) {
    console.error("[createAppointmentReviewAction] erro:", err);
    return {
      success: false,
      error: "Erro ao salvar sua avaliação. Tente novamente.",
    };
  }
}

// ------------------------------
// 👇 NOVA ACTION: "Agora não"
// ------------------------------

type DismissReviewModalResult =
  | { success: true }
  | { success: false; error: string };

export async function dismissAppointmentReviewModalAction(
  appointmentId: string,
): Promise<DismissReviewModalResult> {
  try {
    const session = await getServerSession(nextAuthOptions);
    const userId = (session?.user as any)?.id as string | undefined;

    if (!userId) {
      return {
        success: false,
        error: "Você precisa estar logado para continuar.",
      };
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        clientId: true,
        status: true,
        reviewModalShown: true,
        // ✅ multi-tenant: defensivo
        companyId: true as any,
        review: {
          select: { id: true },
        },
      } as any,
    });

    if (!appointment) {
      return { success: false, error: "Atendimento não encontrado." };
    }

    if (appointment.clientId !== userId) {
      return {
        success: false,
        error: "Você não pode alterar esse atendimento.",
      };
    }

    // Se já tem review, nem faz sentido marcar modal
    if (appointment.review) {
      return { success: true };
    }

    // Se já estava marcado, beleza
    if (appointment.reviewModalShown) {
      return { success: true };
    }

    // ✅ update multi-tenant (se seu schema exigir companyId no where via updateMany)
    // Aqui usamos update com id porque id é unique; o check de clientId já protege.
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        reviewModalShown: true,
      },
    });

    // Revalida a home do cliente (onde o modal é controlado)
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    console.error(
      "[dismissAppointmentReviewModalAction] erro ao marcar reviewModalShown:",
      error,
    );
    return {
      success: false,
      error: "Erro ao atualizar o atendimento. Tente novamente.",
    };
  }
}
