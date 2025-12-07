"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import z from "zod";

const createReviewTagSchema = z.object({
  label: z.string().min(1, "Informe uma descrição.").max(80),
});

export async function createReviewTagAction(formData: FormData): Promise<void> {
  try {
    const raw = {
      label: String(formData.get("label") ?? "").trim(),
    };

    const parsed = createReviewTagSchema.safeParse(raw);

    if (!parsed.success) {
      console.error(
        "[createReviewTagAction] dados inválidos",
        parsed.error.flatten().fieldErrors,
      );
      return;
    }

    const { label } = parsed.data;

    await prisma.reviewTag.create({
      data: {
        label,
        // isActive: default true
        // isNegative: default false
      },
    });

    revalidatePath("/admin/review-tags");
  } catch (error) {
    console.error("[createReviewTagAction] erro:", error);
  }
}

export async function toggleReviewTagStatusAction(
  formData: FormData,
): Promise<void> {
  try {
    const tagId = String(formData.get("tagId") ?? "").trim();
    if (!tagId) {
      console.error("[toggleReviewTagStatusAction] tagId vazio");
      return;
    }

    const existing = await prisma.reviewTag.findUnique({
      where: { id: tagId },
      select: {
        id: true,
        isActive: true,
      },
    });

    if (!existing) {
      console.error("[toggleReviewTagStatusAction] motivo não encontrado");
      return;
    }

    await prisma.reviewTag.update({
      where: { id: tagId },
      data: {
        isActive: !existing.isActive,
      },
    });

    revalidatePath("/admin/review-tags");
  } catch (error) {
    console.error("[toggleReviewTagStatusAction] erro:", error);
  }
}

// 🔹 alternar se a tag é negativa ou não
export async function toggleReviewTagNegativeAction(
  formData: FormData,
): Promise<void> {
  try {
    const tagId = String(formData.get("tagId") ?? "").trim();
    if (!tagId) {
      console.error("[toggleReviewTagNegativeAction] tagId vazio");
      return;
    }

    const existing = await prisma.reviewTag.findUnique({
      where: { id: tagId },
      select: {
        id: true,
        isNegative: true,
      },
    });

    if (!existing) {
      console.error("[toggleReviewTagNegativeAction] motivo não encontrado");
      return;
    }

    await prisma.reviewTag.update({
      where: { id: tagId },
      data: {
        isNegative: !existing.isNegative,
      },
    });

    revalidatePath("/admin/review-tags");
  } catch (error) {
    console.error("[toggleReviewTagNegativeAction] erro:", error);
  }
}

// 🔹 editar o texto (label) da tag
const updateReviewTagSchema = z.object({
  tagId: z.string().min(1),
  label: z.string().min(1, "Informe uma descrição.").max(80),
});

export async function updateReviewTagLabelAction(
  formData: FormData,
): Promise<void> {
  try {
    const raw = {
      tagId: String(formData.get("tagId") ?? "").trim(),
      label: String(formData.get("label") ?? "").trim(),
    };

    const parsed = updateReviewTagSchema.safeParse(raw);

    if (!parsed.success) {
      console.error(
        "[updateReviewTagLabelAction] dados inválidos",
        parsed.error.flatten().fieldErrors,
      );
      return;
    }

    const { tagId, label } = parsed.data;

    await prisma.reviewTag.update({
      where: { id: tagId },
      data: {
        label,
      },
    });

    revalidatePath("/admin/review-tags");
  } catch (error) {
    console.error("[updateReviewTagLabelAction] erro:", error);
  }
}
