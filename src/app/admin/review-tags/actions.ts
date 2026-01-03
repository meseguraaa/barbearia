"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import z from "zod";
import { requireAdminPermission } from "@/lib/admin-permissions";

const COMPANY_COOKIE_NAME = "admin_company_context";

/**
 * Fonte da verdade do tenant:
 * - Prioriza companyId vindo do <form> (hidden input)
 * - Fallback: cookie admin_company_context (compat)
 */
async function getCompanyIdOrThrow(formData?: FormData) {
  const fromForm = formData
    ? String(formData.get("companyId") ?? "").trim()
    : "";

  if (fromForm) return fromForm;

  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(COMPANY_COOKIE_NAME)?.value?.trim();

  if (!fromCookie) {
    throw new Error(
      `[review-tags/actions] companyId ausente (formData.companyId e cookie "${COMPANY_COOKIE_NAME}")`,
    );
  }

  return fromCookie;
}

const createReviewTagSchema = z.object({
  label: z.string().min(1, "Informe uma descrição.").max(80),
});

export async function createReviewTagAction(formData: FormData): Promise<void> {
  try {
    await requireAdminPermission("canAccessReviews");

    const companyId = await getCompanyIdOrThrow(formData);

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
        companyId,
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
    await requireAdminPermission("canAccessReviews");

    const companyId = await getCompanyIdOrThrow(formData);

    const tagId = String(formData.get("tagId") ?? "").trim();
    if (!tagId) {
      console.error("[toggleReviewTagStatusAction] tagId vazio");
      return;
    }

    const existing = await prisma.reviewTag.findFirst({
      where: { id: tagId, companyId },
      select: { id: true, isActive: true },
    });

    if (!existing) {
      console.error(
        "[toggleReviewTagStatusAction] motivo não encontrado (ou não pertence à company)",
      );
      return;
    }

    // updateMany = não depende de unique composto (id+companyId)
    const updated = await prisma.reviewTag.updateMany({
      where: { id: tagId, companyId },
      data: { isActive: !existing.isActive },
    });

    if (updated.count === 0) {
      console.error(
        "[toggleReviewTagStatusAction] nada foi atualizado (company scope)",
      );
      return;
    }

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
    await requireAdminPermission("canAccessReviews");

    const companyId = await getCompanyIdOrThrow(formData);

    const tagId = String(formData.get("tagId") ?? "").trim();
    if (!tagId) {
      console.error("[toggleReviewTagNegativeAction] tagId vazio");
      return;
    }

    const existing = await prisma.reviewTag.findFirst({
      where: { id: tagId, companyId },
      select: { id: true, isNegative: true },
    });

    if (!existing) {
      console.error(
        "[toggleReviewTagNegativeAction] motivo não encontrado (ou não pertence à company)",
      );
      return;
    }

    const updated = await prisma.reviewTag.updateMany({
      where: { id: tagId, companyId },
      data: { isNegative: !existing.isNegative },
    });

    if (updated.count === 0) {
      console.error(
        "[toggleReviewTagNegativeAction] nada foi atualizado (company scope)",
      );
      return;
    }

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
    await requireAdminPermission("canAccessReviews");

    const companyId = await getCompanyIdOrThrow(formData);

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

    const updated = await prisma.reviewTag.updateMany({
      where: { id: tagId, companyId },
      data: { label },
    });

    if (updated.count === 0) {
      console.error(
        "[updateReviewTagLabelAction] nada foi atualizado (company scope)",
      );
      return;
    }

    revalidatePath("/admin/review-tags");
  } catch (error) {
    console.error("[updateReviewTagLabelAction] erro:", error);
  }
}
