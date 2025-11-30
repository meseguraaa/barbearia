// app/admin/finance/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { format } from "date-fns";

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

/* =====================================================================
 * CREATE
 * ===================================================================== */

export async function createExpense(formData: FormData) {
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
    // Para recorrentes, usamos apenas o DIA + mês/ano de referência
    const day = Number(recurringDayRaw || 1);

    if (monthParam) {
      const [year, month] = monthParam.split("-").map(Number);
      // month - 1 porque Date usa 0 = janeiro
      dueDate = new Date(year, month - 1, day);
    } else {
      // fallback: mês atual
      const now = new Date();
      dueDate = new Date(now.getFullYear(), now.getMonth(), day);
    }
  } else {
    // Para não recorrentes, usa a data completa do input date
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
    console.error("[createExpense] Erro de validação:", result.error.flatten());
    return { error: "Dados inválidos ao criar despesa." };
  }

  const parsed = result.data;

  await prisma.expense.create({
    data: {
      description: parsed.description,
      category: parsed.category,
      amount: parsed.amount,
      dueDate,
      isRecurring: parsed.isRecurring,
      isPaid: parsed.isPaid,
    },
  });

  const monthQuery = format(dueDate, "yyyy-MM");

  revalidatePath("/admin/finance");
  redirect(`/admin/finance?month=${monthQuery}`);
}

/* =====================================================================
 * UPDATE
 * ===================================================================== */

export async function updateExpense(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) {
    console.warn("[updateExpense] ID vazio");
    return { error: "ID da despesa não informado." };
  }

  const rawIsRecurring = formData.get("isRecurring");
  const rawIsPaid = formData.get("isPaid");

  const isRecurring = rawIsRecurring === "on";
  const isPaid = rawIsPaid === "on";
  const amountNumber = Number(formData.get("amount") || 0);
  const recurringDayRaw = formData.get("recurringDay");

  // Busca o registro original
  const existing = await prisma.expense.findUnique({
    where: { id },
  });

  if (!existing) {
    console.warn("[updateExpense] Despesa não encontrada:", id);
    return { error: "Despesa não encontrada." };
  }

  let dueDate: Date;

  if (isRecurring) {
    // Mantém ano/mês do registro original, trocando só o dia (se enviado)
    const baseYear = existing.dueDate.getFullYear();
    const baseMonth = existing.dueDate.getMonth(); // 0..11
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
    console.error("[updateExpense] Erro de validação:", result.error.flatten());
    return { error: "Dados inválidos ao atualizar despesa." };
  }

  const parsed = result.data;

  await prisma.$transaction(async (tx) => {
    // 1) Atualiza o mês atual
    const updated = await tx.expense.update({
      where: { id: parsed.id },
      data: {
        description: parsed.description,
        amount: parsed.amount,
        dueDate,
        isRecurring: parsed.isRecurring,
        isPaid: parsed.isPaid,
      },
    });

    // 2) Se deixou de ser recorrente, não propaga nada
    if (!updated.isRecurring) {
      return;
    }

    // 3) Propaga o novo valor / descrição para TODOS os meses FUTUROS dessa série.
    // Série: mesma description ORIGINAL + isRecurring = true + dueDate > updated.dueDate
    await tx.expense.updateMany({
      where: {
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
        // category permanece como está (não alteramos mais no front)
      },
    });
  });

  const monthQuery = format(dueDate, "yyyy-MM");

  revalidatePath("/admin/finance");
  redirect(`/admin/finance?month=${monthQuery}`);
}

/* =====================================================================
 * TOGGLE PAGA / NÃO PAGA
 * ===================================================================== */

export async function toggleExpensePaid(formData: FormData) {
  const expenseId = String(formData.get("expenseId") || "");

  if (!expenseId) {
    console.warn("[toggleExpensePaid] expenseId vazio");
    return;
  }

  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
  });

  if (!expense) {
    console.warn("[toggleExpensePaid] Despesa não encontrada:", expenseId);
    return;
  }

  await prisma.expense.update({
    where: { id: expenseId },
    data: {
      isPaid: !expense.isPaid,
    },
  });

  const monthQuery = format(expense.dueDate, "yyyy-MM");

  revalidatePath("/admin/finance");
  redirect(`/admin/finance?month=${monthQuery}`);
}

/* =====================================================================
 * DELETE
 * ===================================================================== */

export async function deleteExpense(formData: FormData) {
  const expenseId = String(formData.get("expenseId") || "");

  if (!expenseId) {
    console.warn("[deleteExpense] expenseId vazio");
    return;
  }

  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
  });

  if (!expense) {
    console.warn(
      "[deleteExpense] Despesa não encontrada para delete:",
      expenseId,
    );
    return;
  }

  const monthQuery = format(expense.dueDate, "yyyy-MM");

  // Se NÃO for recorrente, só apaga essa mesma
  if (!expense.isRecurring) {
    await prisma.expense.delete({
      where: { id: expenseId },
    });

    revalidatePath("/admin/finance");
    redirect(`/admin/finance?month=${monthQuery}`);
    return;
  }

  // Se for recorrente: precisamos cortar a série:
  // - Apagar atual + futuras
  // - Marcar a última anterior como isRecurring = false
  await prisma.$transaction(async (tx) => {
    // 1) Apaga atual + futuras da mesma série
    await tx.expense.deleteMany({
      where: {
        isRecurring: true,
        description: expense.description,
        category: expense.category,
        dueDate: {
          gte: expense.dueDate, // atual e futuras
        },
      },
    });

    // 2) Encontra a última recorrente ANTERIOR dessa série
    const previousRecurring = await tx.expense.findFirst({
      where: {
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
    });

    // 3) Se existir, marca como NÃO recorrente
    if (previousRecurring) {
      await tx.expense.update({
        where: { id: previousRecurring.id },
        data: {
          isRecurring: false,
        },
      });
    }
  });

  revalidatePath("/admin/finance");
  redirect(`/admin/finance?month=${monthQuery}`);
}
