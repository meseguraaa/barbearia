import type { Expense } from "@prisma/client";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  ExpenseStatusBadge,
  type ExpenseStatus,
} from "@/components/expense-status-badge";
import { RecurringBadge } from "@/components/recurring-badge";
import { ExpenseDueDatePicker } from "@/components/expense-due-date-picker";

import {
  updateExpense,
  toggleExpensePaid,
  deleteExpense,
} from "@/app/admin/finance/actions";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

type AdminExpenseRowProps = {
  expense: Expense;
};

export function AdminExpenseRow({ expense }: AdminExpenseRowProps) {
  const isPaid = expense.isPaid;
  const isOverdue = !isPaid && expense.dueDate < new Date();

  const status: ExpenseStatus = isPaid
    ? "PAID"
    : isOverdue
      ? "LATE"
      : "PENDING";

  const dueDateForInput = format(expense.dueDate, "yyyy-MM-dd");
  const recurringDayDefault = expense.dueDate.getDate().toString();

  return (
    <tr className="border-t border-border-primary">
      <td className="px-4 py-3 text-paragraph-medium text-content-primary">
        {expense.description}
      </td>

      <td className="px-4 py-3 text-paragraph-small text-content-secondary">
        {format(expense.dueDate, "dd/MM/yyyy")}
      </td>

      <td className="px-4 py-3 text-right text-paragraph-medium text-content-primary">
        {currencyFormatter.format(Number(expense.amount))}
      </td>

      <td className="px-4 py-3 text-center">
        <RecurringBadge isRecurring={expense.isRecurring} />
      </td>

      <td className="px-4 py-3 text-center">
        <ExpenseStatusBadge status={status} />
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          {/* EDITAR em modal inline */}
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="edit2"
                size="sm"
                className="border-border-primary hover:bg-muted/40"
              >
                Editar
              </Button>
            </DialogTrigger>

            <DialogContent className="bg-background-secondary border border-border-primary">
              <DialogHeader>
                <DialogTitle className="text-title text-content-primary">
                  Editar despesa
                </DialogTitle>
              </DialogHeader>

              <form
                action={async (formData) => {
                  "use server";
                  // 👇 ignora o retorno da action (não retorna nada)
                  await updateExpense(formData);
                }}
                className="space-y-4"
              >
                <input type="hidden" name="id" value={expense.id} />

                <div className="space-y-1">
                  <label className="text-label-small text-content-secondary">
                    Descrição
                  </label>
                  <Input
                    name="description"
                    required
                    defaultValue={expense.description}
                    className="bg-background-tertiary border-border-primary text-content-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-label-small text-content-secondary">
                    Valor (R$)
                  </label>
                  <Input
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    defaultValue={Number(expense.amount)}
                    className="bg-background-tertiary border-border-primary text-content-primary"
                  />
                </div>

                {/* RECORRENTE + CAMPOS DE VENCIMENTO */}
                <div className="space-y-3">
                  {/* checkbox real (peer) */}
                  <input
                    id={`isRecurring-${expense.id}`}
                    name="isRecurring"
                    type="checkbox"
                    defaultChecked={expense.isRecurring}
                    className="peer sr-only"
                  />

                  {/* UI do checkbox */}
                  <label
                    htmlFor={`isRecurring-${expense.id}`}
                    className="inline-flex items-center gap-2 cursor-pointer"
                  >
                    <span className="flex h-4 w-4 items-center justify-center rounded border border-border-primary bg-background-tertiary peer-checked:border-border-brand peer-checked:bg-border-brand">
                      <span className="h-2 w-2 rounded-sm bg-transparent peer-checked:bg-background-primary" />
                    </span>
                    <span className="text-label-small text-content-primary">
                      Despesa recorrente
                    </span>
                  </label>

                  {/* Dia de vencimento para recorrentes */}
                  <div className="space-y-1 hidden peer-checked:block">
                    <label className="text-label-small text-content-secondary">
                      Dia de vencimento (se recorrente)
                    </label>
                    <Input
                      name="recurringDay"
                      type="number"
                      min={1}
                      max={31}
                      defaultValue={recurringDayDefault}
                      className="bg-background-tertiary border-border-primary text-content-primary"
                    />
                    <p className="text-paragraph-small text-content-secondary">
                      Para despesas recorrentes, informe apenas o dia do mês.
                    </p>
                  </div>

                  {/* Data completa para não recorrentes */}
                  <div className="space-y-1 peer-checked:hidden">
                    <label className="text-label-small text-content-secondary">
                      Data de vencimento (se NÃO recorrente)
                    </label>

                    <ExpenseDueDatePicker
                      name="dueDate"
                      defaultValue={dueDateForInput}
                    />

                    <p className="text-paragraph-small text-content-secondary">
                      Use este campo para despesas que acontecem em uma data
                      única.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="submit" variant="brand">
                    Salvar alterações
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {/* MARCAR / DESMARCAR COMO PAGA */}
          <form
            action={async (formData) => {
              "use server";
              await toggleExpensePaid(formData);
            }}
          >
            <input type="hidden" name="expenseId" value={expense.id} />
            <Button
              variant={expense.isPaid ? "outline" : "active"}
              size="sm"
              type="submit"
              className="border-border-primary hover:bg-muted/40"
            >
              {expense.isPaid ? "Desmarcar paga" : "Marcar como paga"}
            </Button>
          </form>

          {/* EXCLUIR */}
          <form
            action={async (formData) => {
              "use server";
              await deleteExpense(formData);
            }}
          >
            <input type="hidden" name="expenseId" value={expense.id} />
            <Button
              variant="destructive"
              size="sm"
              type="submit"
              className="border-border-primary hover:bg-muted/40"
            >
              Excluir
            </Button>
          </form>
        </div>
      </td>
    </tr>
  );
}
