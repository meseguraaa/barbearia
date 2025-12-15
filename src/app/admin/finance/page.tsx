// app/admin/finance/page.tsx
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import { MonthPicker } from "@/components/month-picker";
import { endOfMonth, format, parse, startOfMonth, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createExpense } from "./actions";
import { ExpenseDueDatePicker } from "@/components/expense-due-date-picker";
import { AdminExpenseRow } from "@/components/admin-expense-row";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Financeiro",
};

type AdminFinancePageProps = {
  searchParams: Promise<{
    month?: string; // yyyy-MM
  }>;
};

const UNIT_COOKIE_NAME = "admin_unit_context";
const UNIT_ALL_VALUE = "all";

/* ======================================================
 * TIPOS
 * ======================================================*/
type BarberMonthlyEarnings = {
  barberId: string;
  name: string;
  email: string | null;
  phone: string | null;
  servicesEarnings: number;
  productsEarnings: number;
};

/* ======================================================
 * UNIDADE (MESMA REGRA DO CHECKOUT)
 * ======================================================*/
async function resolveUnitScope(admin: {
  unitId: string | null;
  canSeeAllUnits: boolean;
}) {
  if (!admin.canSeeAllUnits) return admin.unitId;

  const cookieStore = await cookies();
  const cookieValue =
    cookieStore.get(UNIT_COOKIE_NAME)?.value ?? UNIT_ALL_VALUE;

  if (!cookieValue || cookieValue === UNIT_ALL_VALUE) return null;
  return cookieValue;
}

function withUnitWhere<T extends Record<string, any>>(
  base: T,
  unitId: string | null,
) {
  if (!unitId) return base;
  return { ...(base as any), unitId } as T;
}

/* ======================================================
 * RECORRÊNCIA DE DESPESAS (POR UNIDADE)
 * ======================================================*/
async function seedRecurringExpensesForMonth(
  monthStart: Date,
  monthEnd: Date,
  activeUnitId: string | null,
) {
  const previousMonthStart = startOfMonth(addMonths(monthStart, -1));
  const previousMonthEnd = endOfMonth(previousMonthStart);

  const lastMonthRecurringExpenses = await prisma.expense.findMany({
    where: withUnitWhere(
      {
        isRecurring: true,
        dueDate: {
          gte: previousMonthStart,
          lte: previousMonthEnd,
        },
      },
      activeUnitId,
    ) as any,
    select: {
      description: true,
      category: true,
      amount: true,
      dueDate: true,
      unitId: true,
    },
  });

  if (lastMonthRecurringExpenses.length === 0) return;

  const year = monthStart.getFullYear();
  const monthIndex = monthStart.getMonth();

  for (const expense of lastMonthRecurringExpenses) {
    const day = expense.dueDate.getDate();

    const exists = await prisma.expense.findFirst({
      where: {
        isRecurring: true,
        description: expense.description,
        category: expense.category,
        unitId: expense.unitId,
        dueDate: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
    });

    if (exists) continue;

    await prisma.expense.create({
      data: {
        description: expense.description,
        category: expense.category,
        amount: expense.amount,
        isRecurring: true,
        isPaid: false,
        dueDate: new Date(year, monthIndex, day),
        unitId: expense.unitId,
      },
    });
  }
}

/* ======================================================
 * PAGE
 * ======================================================*/
export default async function AdminFinancePage({
  searchParams,
}: AdminFinancePageProps) {
  const admin = (await requireAdminPermission("canAccessFinance")) as any;

  const activeUnitId = await resolveUnitScope({
    unitId: admin?.unitId ?? null,
    canSeeAllUnits: !!admin?.canSeeAllUnits,
  });

  const { month: monthParam } = await searchParams;

  const referenceDate = monthParam
    ? parse(monthParam, "yyyy-MM", new Date())
    : new Date();

  const monthStart = startOfMonth(referenceDate);
  const monthEnd = endOfMonth(referenceDate);

  await seedRecurringExpensesForMonth(monthStart, monthEnd, activeUnitId);

  /* ======================================================
   * 🔒 REGRA DE OURO
   * Financeiro = SOMENTE Order COMPLETED
   * ======================================================*/
  const paidOrdersWhere = {
    status: "COMPLETED" as const,
    createdAt: { gte: monthStart, lte: monthEnd },
    ...(activeUnitId ? { unitId: activeUnitId } : {}),
  };

  const [expenses, paidOrders, productSales, barbers] = await Promise.all([
    prisma.expense.findMany({
      where: withUnitWhere(
        {
          dueDate: { gte: monthStart, lte: monthEnd },
        },
        activeUnitId,
      ) as any,
      orderBy: { dueDate: "asc" },
    }),

    prisma.order.findMany({
      where: paidOrdersWhere as any,
      include: {
        items: {
          include: {
            service: true,
            product: true,
          },
        },
        appointment: {
          include: {
            barber: true,
            service: true,
          },
        },
      },
    }),

    prisma.productSale.findMany({
      where: {
        soldAt: { gte: monthStart, lte: monthEnd },
        ...(activeUnitId ? { unitId: activeUnitId } : {}),
      },
      include: {
        product: true,
        barber: true,
      },
    }),

    prisma.barber.findMany({
      where: {
        isActive: true,
        ...(activeUnitId
          ? { units: { some: { unitId: activeUnitId, isActive: true } } }
          : {}),
      },
      orderBy: { name: "asc" },
    }),
  ]);

  /* ======================================================
   * DESPESAS
   * ======================================================*/
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  /* ======================================================
   * SERVIÇOS (PEDIDOS PAGOS)
   * ======================================================*/
  let servicesNetMonth = 0;
  let servicesCommissionMonth = 0;

  for (const order of paidOrders) {
    const appt: any = order.appointment;
    if (!appt) continue;

    let commission = 0;

    if (appt.barberEarningValue != null) {
      commission = Number(appt.barberEarningValue);
    } else {
      const price = appt.servicePriceAtTheTime ?? appt.service?.price ?? 0;

      const percent =
        appt.barberPercentageAtTheTime ?? appt.service?.barberPercentage ?? 0;

      commission = (Number(price) * Number(percent)) / 100;
    }

    servicesCommissionMonth += commission;
  }

  const servicesGrossMonth = paidOrders.reduce((sum, order) => {
    const serviceItems = order.items.filter((i) => i.serviceId);
    return (
      sum + serviceItems.reduce((s, i) => s + Number(i.totalPrice ?? 0), 0)
    );
  }, 0);

  servicesNetMonth = servicesGrossMonth - servicesCommissionMonth;

  /* ======================================================
   * PRODUTOS
   * ======================================================*/
  const productsGrossMonth = productSales.reduce(
    (sum, s) => sum + Number(s.totalPrice),
    0,
  );

  const productsCommissionMonth = productSales.reduce((sum, s) => {
    const percent = s.product?.barberPercentage ?? 0;
    return sum + (Number(s.totalPrice) * percent) / 100;
  }, 0);

  const productsNetMonth = productsGrossMonth - productsCommissionMonth;

  /* ======================================================
   * RESULTADOS
   * ======================================================*/
  const netRevenueMonth = servicesNetMonth + productsNetMonth;

  const netIncome = netRevenueMonth - totalExpenses;

  const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  const monthLabel = format(referenceDate, "MMMM 'de' yyyy", {
    locale: ptBR,
  }).replace(/^./, (c) => c.toUpperCase());

  /* ======================================================
   * FATURAMENTO POR BARBEIRO
   * ======================================================*/
  const barberEarningsMap = new Map<string, BarberMonthlyEarnings>();

  barbers.forEach((b) => {
    barberEarningsMap.set(b.id, {
      barberId: b.id,
      name: b.name ?? "Barbeiro",
      email: b.email ?? null,
      phone: b.phone ?? null,
      servicesEarnings: 0,
      productsEarnings: 0,
    });
  });

  for (const order of paidOrders) {
    const appt: any = order.appointment;
    if (!appt?.barberId) continue;

    const entry = barberEarningsMap.get(appt.barberId);
    if (!entry) continue;

    let commission = 0;

    if (appt.barberEarningValue != null) {
      commission = Number(appt.barberEarningValue);
    } else {
      const price = appt.servicePriceAtTheTime ?? appt.service?.price ?? 0;

      const percent =
        appt.barberPercentageAtTheTime ?? appt.service?.barberPercentage ?? 0;

      commission = (Number(price) * Number(percent)) / 100;
    }

    entry.servicesEarnings += commission;
  }

  productSales.forEach((sale) => {
    if (!sale.barberId) return;
    const entry = barberEarningsMap.get(sale.barberId);
    if (!entry) return;

    const percent = sale.product?.barberPercentage ?? 0;
    entry.productsEarnings += (Number(sale.totalPrice) * percent) / 100;
  });

  const barberEarningsList = Array.from(barberEarningsMap.values()).sort(
    (a, b) => a.name.localeCompare(b.name),
  );

  /* ======================================================
   * RENDER
   * ======================================================*/
  return (
    <div className="space-y-6 max-w-7xl">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-title text-content-primary">Financeiro</h1>
          <p className="text-paragraph-small text-content-secondary">
            Mês selecionado: <span className="font-medium">{monthLabel}</span>
          </p>
        </div>

        <MonthPicker />
      </header>

      {/* RESUMO FINANCEIRO DO MÊS */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1 rounded-xl border border-border-primary bg-background-tertiary px-4 py-3">
          <p className="text-label-small text-content-secondary">
            Faturamento líquido (pagos no mês)
          </p>
          <p className="text-title text-content-primary">
            {currencyFormatter.format(netRevenueMonth)}
          </p>
          <p className="text-paragraph-small text-content-secondary">
            Serviços (líq.):{" "}
            <span className="font-semibold">
              {currencyFormatter.format(servicesNetMonth)}
            </span>{" "}
            • Produtos (líq.):{" "}
            <span className="font-semibold">
              {currencyFormatter.format(productsNetMonth)}
            </span>
          </p>
          <p className="text-paragraph-small text-content-tertiary">
            Só entra aqui o que estiver marcado como pago (Checkout).
          </p>
        </div>

        <div className="space-y-1 rounded-xl border border-border-primary bg-background-tertiary px-4 py-3">
          <p className="text-label-small text-content-secondary">
            Despesas (mês)
          </p>
          <p className="text-title text-content-primary">
            {currencyFormatter.format(totalExpenses)}
          </p>
          <p className="text-paragraph-small text-content-secondary">
            Todas as despesas cadastradas para este mês.
          </p>
        </div>

        <div className="space-y-1 rounded-xl border border-border-primary bg-background-tertiary px-4 py-3">
          <p className="text-label-small text-content-secondary">
            Lucro líquido (mês)
          </p>
          <p
            className={`text-title ${
              netIncome >= 0 ? "text-green-500" : "text-red-600"
            }`}
          >
            {currencyFormatter.format(netIncome)}
          </p>
          <p className="text-paragraph-small text-content-secondary">
            Faturamento líquido (pagos no mês) menos as despesas do mês.
          </p>
        </div>
      </section>

      <BarberMonthlyEarningsSection
        barbersEarnings={barberEarningsList}
        currencyFormatter={currencyFormatter}
      />

      <div>
        <h2 className="text-subtitle text-content-primary">
          Cadastro de despesas (mês)
        </h2>
        <p className="text-paragraph-small text-content-secondary">
          Contas cadastradas para este mês, incluindo despesas recorrentes e
          avulsas.
        </p>
      </div>

      <section className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border-primary bg-muted/40 text-left text-label-small text-content-secondary">
              <th className="px-4 py-2">Descrição</th>
              <th className="px-4 py-2">Vencimento</th>
              <th className="px-4 py-2 text-right">Valor</th>
              <th className="px-4 py-2 text-center">Recorrente</th>
              <th className="px-4 py-2 text-center">Status</th>
              <th className="px-4 py-2 text-right">Ações</th>
            </tr>
          </thead>

          <tbody>
            {expenses.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-6 text-center text-paragraph-small text-content-secondary"
                >
                  Nenhuma despesa cadastrada para este mês.
                </td>
              </tr>
            ) : (
              expenses.map((expense) => (
                <AdminExpenseRow key={expense.id} expense={expense} />
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/* ========= SEÇÃO: FATURAMENTO POR BARBEIRO ========= */

function BarberMonthlyEarningsSection({
  barbersEarnings,
  currencyFormatter,
}: {
  barbersEarnings: BarberMonthlyEarnings[];
  currencyFormatter: Intl.NumberFormat;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-subtitle text-content-primary">
          Faturamento por barbeiro (mês)
        </h2>
        <p className="text-paragraph-small text-content-secondary">
          Valores recebidos pelos barbeiros em serviços e comissões de produtos
          (pagos no mês).
        </p>
      </div>

      {barbersEarnings.length === 0 ? (
        <p className="text-paragraph-small text-content-secondary">
          Nenhum barbeiro ativo cadastrado.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {barbersEarnings.map((barber) => {
            const total = barber.servicesEarnings + barber.productsEarnings;

            return (
              <div
                key={barber.barberId}
                className="space-y-2 rounded-xl border border-border-primary bg-background-tertiary px-4 py-3"
              >
                <p className="text-label-large text-content-primary">
                  {barber.name}
                </p>
                <p className="text-paragraph-small text-content-secondary">
                  Serviços:{" "}
                  <span className="font-semibold">
                    {currencyFormatter.format(barber.servicesEarnings)}
                  </span>
                </p>
                <p className="text-paragraph-small text-content-secondary">
                  Produtos:{" "}
                  <span className="font-semibold">
                    {currencyFormatter.format(barber.productsEarnings)}
                  </span>
                </p>
                <p className="text-paragraph-small text-content-secondary">
                  Total recebido:{" "}
                  <span className="font-semibold">
                    {currencyFormatter.format(total)}
                  </span>
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ========= NOVA DESPESA ========= */

function NewExpenseDialog({
  month,
  unitId,
  disabled,
}: {
  month: string;
  unitId: string | null;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <Button
        variant="brand"
        disabled
        title="Selecione uma unidade para cadastrar despesas"
      >
        Nova despesa
      </Button>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="brand">Nova despesa</Button>
      </DialogTrigger>

      <DialogContent className="bg-background-secondary border border-border-primary">
        <DialogHeader>
          <DialogTitle className="text-title text-content-primary">
            Nova despesa
          </DialogTitle>
        </DialogHeader>

        <form
          action={async (formData) => {
            "use server";
            const result = await createExpense(formData);

            if (!result.ok) {
              console.error("[NewExpenseDialog] createExpense:", result.error);
              return;
            }

            const monthQuery = result.monthQuery ?? month;
            redirect(`/admin/finance?month=${monthQuery}`);
          }}
          className="space-y-4"
        >
          <input type="hidden" name="month" value={month} />
          <input type="hidden" name="category" value="OTHER" />
          {/* ✅ unitId obrigatório */}
          <input type="hidden" name="unitId" value={unitId ?? ""} />

          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="description"
            >
              Descrição
            </label>
            <Input
              id="description"
              name="description"
              required
              placeholder="Ex: Aluguel, Luz, Internet..."
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          <div className="space-y-1">
            <label
              className="text-label-small text-content-secondary"
              htmlFor="amount"
            >
              Valor (R$)
            </label>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              required
              className="bg-background-tertiary border-border-primary text-content-primary"
            />
          </div>

          <div className="space-y-3">
            <input
              id="isRecurring"
              name="isRecurring"
              type="checkbox"
              className="peer sr-only"
            />

            <label
              htmlFor="isRecurring"
              className="
                inline-flex items-center gap-2 cursor-pointer
                peer-checked:[&_.box]:bg-border-brand
                peer-checked:[&_.box]:border-border-brand
                peer-checked:[&_.check]:bg-background-primary
              "
            >
              <span
                className="
                  box flex h-4 w-4 items-center justify-center
                  rounded border border-border-primary bg-background-tertiary
                  transition-colors
                "
              >
                <span className="check h-2 w-2 rounded-sm bg-transparent transition-colors" />
              </span>
              <span className="text-label-small text-content-primary">
                Despesa recorrente
              </span>
            </label>

            <div className="space-y-1 hidden peer-checked:block">
              <label
                className="text-label-small text-content-secondary"
                htmlFor="recurringDay"
              >
                Dia de vencimento (se recorrente)
              </label>
              <Input
                id="recurringDay"
                name="recurringDay"
                type="number"
                min={1}
                max={31}
                placeholder="Ex: 10"
                className="bg-background-tertiary border-border-primary text-content-primary"
              />
              <p className="text-paragraph-small text-content-secondary">
                Para despesas recorrentes, informe apenas o dia de vencimento.
              </p>
            </div>

            <div className="space-y-1 peer-checked:hidden">
              <label
                className="text-label-small text-content-secondary"
                htmlFor="dueDate"
              >
                Data de vencimento (se NÃO recorrente)
              </label>

              <ExpenseDueDatePicker id="dueDate" name="dueDate" />

              <p className="text-paragraph-small text-content-secondary">
                Use este campo para despesas que acontecem em uma data única.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" variant="brand">
              Salvar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
