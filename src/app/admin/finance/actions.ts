// app/admin/finance/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { format } from "date-fns";

type ActionResult =
  | { ok: true; monthQuery?: string }
  | { ok: false; error: string };

// Mesmas categorias usadas no formulário (apenas para CRIAÇÃO)
const ExpenseCategoryEnum = z.enum([
  "RENT",
  "UTILITIES",
  "TAXES",
  "SUPPLIES",
  "OTHER",
]);

const baseExpenseSchema = z.object({
  description: z.string().min(1, "Descrição obrigatória"),
  category: ExpenseCategoryEnum,
  amount: z.number().nonnegative("Valor não pode ser negativo"),
  isRecurring: z.boolean(),
  isPaid: z.boolean(),
});

// Criação ainda usa categoria (hidden no form = "OTHER")
const createExpenseSchema = baseExpenseSchema;

// Atualização NÃO mexe mais com categoria
const updateExpenseSchema = z.object({
  id: z.string().min(1, "ID obrigatório"),
  description: z.string().min(1, "Descrição obrigatória"),
  amount: z.number().nonnegative("Valor não pode ser negativo"),
  isRecurring: z.boolean(),
  isPaid: z.boolean(),
});

/**
 * Resolve um unitId:
 * - tenta pegar do form (se existir)
 * - senão, pega a primeira unit (prioriza ativa)
 *
 * Mantém compatibilidade enquanto alguma UI não manda unitId.
 */
async function getUnitIdFromFormOrDefault(formData: FormData): Promise<string> {
  const raw = formData.get("unitId");
  const fromForm = String(raw ?? "").trim();
  if (fromForm) return fromForm;

  const unit =
    (await prisma.unit.findFirst({
      where: { isActive: true },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    })) ??
    (await prisma.unit.findFirst({
      select: { id: true },
      orderBy: { createdAt: "asc" },
    }));

  if (!unit) {
    throw new Error(
      "Nenhuma unidade encontrada. Crie uma unidade antes de cadastrar despesas.",
    );
  }

  return unit.id;
}

/* =====================================================================
 * CREATE
 * ===================================================================== */

export async function createExpense(formData: FormData): Promise<ActionResult> {
  try {
    const rawIsRecurring = formData.get("isRecurring");
    const rawIsPaid = formData.get("isPaid");

    const isRecurring = rawIsRecurring === "on";
    const isPaid = rawIsPaid === "on";

    const amountNumber = Number(formData.get("amount") || 0);

    // month vem como "yyyy-MM" (mês selecionado no MonthPicker)
    const monthParam = String(formData.get("month") || "");
    const recurringDayRaw = formData.get("recurringDay");

    let dueDate: Date;

    if (isRecurring) {
      const day = Number(recurringDayRaw || 1);

      if (monthParam) {
        const [year, month] = monthParam.split("-").map(Number);
        dueDate = new Date(year, month - 1, day);
      } else {
        const now = new Date();
        dueDate = new Date(now.getFullYear(), now.getMonth(), day);
      }
    } else {
      const dueDateStr = String(formData.get("dueDate") || "");
      dueDate = new Date(dueDateStr);
    }

    const result = createExpenseSchema.safeParse({
      description: formData.get("description"),
      category: formData.get("category"),
      amount: amountNumber,
      isRecurring,
      isPaid,
    });

    if (!result.success) {
      console.error(
        "[createExpense] Erro de validação:",
        result.error.flatten(),
      );
      return { ok: false, error: "Dados inválidos ao criar despesa." };
    }

    const parsed = result.data;

    const unitId = await getUnitIdFromFormOrDefault(formData);

    await prisma.expense.create({
      data: {
        description: parsed.description,
        category: parsed.category,
        amount: parsed.amount,
        dueDate,
        isRecurring: parsed.isRecurring,
        isPaid: parsed.isPaid,

        // ✅ obrigatório agora
        unit: { connect: { id: unitId } },
      },
    });

    const monthQuery = format(dueDate, "yyyy-MM");

    revalidatePath("/admin/finance");
    return { ok: true, monthQuery };
  } catch (err) {
    console.error("[createExpense] Erro:", err);
    const msg =
      err instanceof Error && err.message.includes("Nenhuma unidade")
        ? err.message
        : "Erro ao criar despesa.";
    return { ok: false, error: msg };
  }
}

/* =====================================================================
 * UPDATE
 * ===================================================================== */

export async function updateExpense(formData: FormData): Promise<ActionResult> {
  try {
    const id = String(formData.get("id") || "");
    if (!id) {
      console.warn("[updateExpense] ID vazio");
      return { ok: false, error: "ID da despesa não informado." };
    }

    const rawIsRecurring = formData.get("isRecurring");
    const rawIsPaid = formData.get("isPaid");

    const isRecurring = rawIsRecurring === "on";
    const isPaid = rawIsPaid === "on";
    const amountNumber = Number(formData.get("amount") || 0);
    const recurringDayRaw = formData.get("recurringDay");

    const existing = await prisma.expense.findUnique({
      where: { id },
      select: {
        id: true,
        dueDate: true,
        isRecurring: true,
        description: true,
        category: true,
        unitId: true, // ✅ CRÍTICO para não vazar entre unidades
      },
    });

    if (!existing) {
      console.warn("[updateExpense] Despesa não encontrada:", id);
      return { ok: false, error: "Despesa não encontrada." };
    }

    let dueDate: Date;

    if (isRecurring) {
      const baseYear = existing.dueDate.getFullYear();
      const baseMonth = existing.dueDate.getMonth();
      const day =
        recurringDayRaw != null && recurringDayRaw !== ""
          ? Number(recurringDayRaw)
          : existing.dueDate.getDate();

      dueDate = new Date(baseYear, baseMonth, day);
    } else {
      const dueDateStr = String(formData.get("dueDate") || "");
      dueDate = dueDateStr ? new Date(dueDateStr) : existing.dueDate;
    }

    const result = updateExpenseSchema.safeParse({
      id,
      description: formData.get("description"),
      amount: amountNumber,
      isRecurring,
      isPaid,
    });

    if (!result.success) {
      console.error(
        "[updateExpense] Erro de validação:",
        result.error.flatten(),
      );
      return { ok: false, error: "Dados inválidos ao atualizar despesa." };
    }

    const parsed = result.data;

    await prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: { id: parsed.id },
        data: {
          description: parsed.description,
          amount: parsed.amount,
          dueDate,
          isRecurring: parsed.isRecurring,
          isPaid: parsed.isPaid,
        },
        select: {
          id: true,
          dueDate: true,
          isRecurring: true,
          amount: true,
          description: true,
        },
      });

      // Se não é mais recorrente, não propaga série
      if (!updated.isRecurring) return;

      // ✅ Propaga ajustes só para a MESMA série e MESMA UNIDADE
      await tx.expense.updateMany({
        where: {
          unitId: existing.unitId,
          isRecurring: true,
          description: existing.description,
          category: existing.category,
          dueDate: {
            gt: updated.dueDate,
          },
        },
        data: {
          amount: updated.amount,
          description: updated.description,
        },
      });
    });

    const monthQuery = format(dueDate, "yyyy-MM");

    revalidatePath("/admin/finance");
    return { ok: true, monthQuery };
  } catch (err) {
    console.error("[updateExpense] Erro:", err);
    return { ok: false, error: "Erro ao atualizar despesa." };
  }
}

/* =====================================================================
 * TOGGLE PAGA / NÃO PAGA
 * ===================================================================== */

export async function toggleExpensePaid(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const expenseId = String(formData.get("expenseId") || "");

    if (!expenseId) {
      console.warn("[toggleExpensePaid] expenseId vazio");
      return { ok: false, error: "Despesa inválida." };
    }

    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      select: { id: true, isPaid: true, dueDate: true },
    });

    if (!expense) {
      console.warn("[toggleExpensePaid] Despesa não encontrada:", expenseId);
      return { ok: false, error: "Despesa não encontrada." };
    }

    await prisma.expense.update({
      where: { id: expenseId },
      data: {
        isPaid: !expense.isPaid,
      },
      select: { id: true },
    });

    const monthQuery = format(expense.dueDate, "yyyy-MM");

    revalidatePath("/admin/finance");
    return { ok: true, monthQuery };
  } catch (err) {
    console.error("[toggleExpensePaid] Erro:", err);
    return { ok: false, error: "Erro ao alternar pagamento." };
  }
}

/* =====================================================================
 * DELETE
 * ===================================================================== */

export async function deleteExpense(formData: FormData): Promise<ActionResult> {
  try {
    const expenseId = String(formData.get("expenseId") || "");

    if (!expenseId) {
      console.warn("[deleteExpense] expenseId vazio");
      return { ok: false, error: "Despesa inválida." };
    }

    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      select: {
        id: true,
        dueDate: true,
        isRecurring: true,
        description: true,
        category: true,
        unitId: true, // ✅ CRÍTICO para não apagar série de outra unidade
      },
    });

    if (!expense) {
      console.warn(
        "[deleteExpense] Despesa não encontrada para delete:",
        expenseId,
      );
      return { ok: false, error: "Despesa não encontrada." };
    }

    const monthQuery = format(expense.dueDate, "yyyy-MM");

    if (!expense.isRecurring) {
      await prisma.expense.delete({
        where: { id: expenseId },
      });

      revalidatePath("/admin/finance");
      return { ok: true, monthQuery };
    }

    await prisma.$transaction(async (tx) => {
      // ✅ deleta a série (da data pra frente) SOMENTE da mesma unidade
      await tx.expense.deleteMany({
        where: {
          unitId: expense.unitId,
          isRecurring: true,
          description: expense.description,
          category: expense.category,
          dueDate: {
            gte: expense.dueDate,
          },
        },
      });

      // ✅ encontra a recorrente anterior (mesma unidade) e “quebra” a série nela
      const previousRecurring = await tx.expense.findFirst({
        where: {
          unitId: expense.unitId,
          isRecurring: true,
          description: expense.description,
          category: expense.category,
          dueDate: {
            lt: expense.dueDate,
          },
        },
        orderBy: {
          dueDate: "desc",
        },
        select: { id: true },
      });

      if (previousRecurring) {
        await tx.expense.update({
          where: { id: previousRecurring.id },
          data: {
            isRecurring: false,
          },
          select: { id: true },
        });
      }
    });

    revalidatePath("/admin/finance");
    return { ok: true, monthQuery };
  } catch (err) {
    console.error("[deleteExpense] Erro:", err);
    return { ok: false, error: "Erro ao excluir despesa." };
  }
}
