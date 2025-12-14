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
    month?: string; // formato "yyyy-MM"
  }>;
};

const UNIT_COOKIE_NAME = "admin_unit_context";
const UNIT_ALL_VALUE = "all";

// ====== TIPO AUXILIAR: FATURAMENTO POR BARBEIRO ======
type BarberMonthlyEarnings = {
  barberId: string;
  name: string;
  email: string | null;
  phone: string | null;
  servicesEarnings: number;
  productsEarnings: number;
};

// ============ UNIDADE (MESMA REGRA DO CHECKOUT) ============

async function resolveUnitScope(admin: {
  unitId: string | null;
  canSeeAllUnits: boolean;
}) {
  // Admin de unidade: força a unidade dele
  if (!admin.canSeeAllUnits) return admin.unitId;

  // Dono: respeita cookie (all = todas)
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

// ============ LÓGICA DE RECORRÊNCIA (AGORA POR UNIDADE) ============

async function seedRecurringExpensesForMonth(
  monthStart: Date,
  monthEnd: Date,
  activeUnitId: string | null,
) {
  const previousMonthStart = startOfMonth(addMonths(monthStart, -1));
  const previousMonthEnd = endOfMonth(previousMonthStart);

  // ✅ traz unitId (pra replicar na mesma unidade)
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
      id: true,
      description: true,
      category: true,
      amount: true,
      dueDate: true,
      unitId: true,
    },
  });

  if (lastMonthRecurringExpenses.length === 0) return;

  const year = monthStart.getFullYear();
  const monthIndex = monthStart.getMonth(); // 0..11

  for (const expense of lastMonthRecurringExpenses) {
    const day = expense.dueDate.getDate();

    const sameSeriesThisMonth = await prisma.expense.findMany({
      where: {
        isRecurring: true,
        description: expense.description,
        category: expense.category,
        unitId: expense.unitId, // ✅ série por unidade
        dueDate: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      select: { id: true, dueDate: true },
    });

    const alreadyExists = sameSeriesThisMonth.some(
      (e) => e.dueDate.getDate() === day,
    );

    if (alreadyExists) continue;

    await prisma.expense.create({
      data: {
        description: expense.description,
        category: expense.category,
        amount: expense.amount,
        isRecurring: true,
        isPaid: false,
        dueDate: new Date(year, monthIndex, day),

        // ✅ obrigatório
        unitId: expense.unitId,
      },
    });
  }
}

export default async function AdminFinancePage({
  searchParams,
}: AdminFinancePageProps) {
  // 🔐 Permissão: apenas quem tem "Financeiro" liberado (ou Dono)
  const admin = (await requireAdminPermission("canAccessFinance")) as any;

  const activeUnitId = await resolveUnitScope({
    unitId: admin?.unitId ?? null,
    canSeeAllUnits: !!admin?.canSeeAllUnits,
  });

  const resolvedSearchParams = await searchParams;
  const monthParam = resolvedSearchParams.month;

  const referenceDate = monthParam
    ? parse(monthParam, "yyyy-MM", new Date())
    : new Date();

  const monthStart = startOfMonth(referenceDate);
  const monthEnd = endOfMonth(referenceDate);

  // ✅ garante recorrência respeitando unidade (ou todas se dono estiver em "all")
  await seedRecurringExpensesForMonth(monthStart, monthEnd, activeUnitId);

  /**
   * ✅ REGRA DE OURO (do que você falou):
   * Financeiro só pode considerar o que foi "Marcar como pago".
   *
   * Então aqui a gente NÃO usa appointment DONE como base de faturamento.
   * A gente usa Orders COMPLETED (pagas) do mês.
   */
  const paidOrdersWhere = {
    status: "COMPLETED" as const,
    createdAt: { gte: monthStart, lte: monthEnd },

    ...(activeUnitId
      ? {
          items: {
            some: {
              OR: [
                { product: { unitId: activeUnitId } },
                { service: { unitId: activeUnitId } },
              ],
            },
          },
        }
      : {}),
  };

  const [expenses, paidOrders, productSales, barbers] = await Promise.all([
    // Despesas do mês (por unidade)
    prisma.expense.findMany({
      where: withUnitWhere(
        {
          dueDate: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
        activeUnitId,
      ) as any,
      orderBy: {
        dueDate: "asc",
      },
    }),

    // ✅ Pedidos pagos (serviços + produtos) do mês (base oficial do financeiro)
    prisma.order.findMany({
      where: paidOrdersWhere as any,
      include: {
        items: {
          include: {
            service: true,
            product: true,
          },
        },
        // para calcular comissão de serviço corretamente (barberEarningValue / snapshot)
        appointment: {
          include: {
            service: true,
            barber: true,
          },
        },
        barber: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    }),

    // ✅ Vendas de produtos do mês (somente as efetivamente geradas no checkout)
    // Se productSale já nasce apenas quando paga, isso fica certinho.
    prisma.productSale.findMany({
      where: {
        soldAt: { gte: monthStart, lte: monthEnd },

        ...(activeUnitId
          ? {
              // ✅ ProductSale não tem unitId → filtra pela unidade do PRODUCT
              product: { unitId: activeUnitId },

              // (opcional, mas ajuda a manter coerência caso tenha venda “solta”)
              // barber: { units: { some: { unitId: activeUnitId, isActive: true } } },
            }
          : {}),
      },
      include: {
        product: true,
        barber: true,
      },
    }),

    // Barbeiros ATIVOS (por unidade)
    prisma.barber.findMany({
      where: {
        isActive: true,
        ...(activeUnitId
          ? {
              units: {
                some: { unitId: activeUnitId, isActive: true },
              },
            }
          : {}),
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // ===== DESPESAS DO MÊS =====
  const totalExpenses = expenses.reduce((acc, expense) => {
    return acc + Number(expense.amount);
  }, 0);

  // ============================
  // FATURAMENTO (SÓ PEDIDOS PAGOS)
  // ============================

  // Serviços pagos (por orders)
  let servicesGrossMonth = 0;
  let servicesCommissionMonth = 0;
  let servicesNetMonth = 0;

  for (const order of paidOrders) {
    // soma itens de serviço
    const serviceItems = (order.items ?? []).filter((i: any) => i.serviceId);
    if (serviceItems.length === 0) continue;

    const gross = serviceItems.reduce(
      (sum: number, i: any) => sum + Number(i.totalPrice ?? 0),
      0,
    );

    // comissão do barbeiro: prioridade para snapshot do appointment (mais confiável)
    // fallback: percent do service
    const appt: any = order.appointment;
    let commission = 0;

    if (appt) {
      const earningSnapshot = appt.barberEarningValue;
      if (earningSnapshot != null) {
        commission = Number(earningSnapshot);
      } else {
        const priceSnapshot = appt.servicePriceAtTheTime;
        const priceService = appt.service?.price ?? 0;
        const priceNumber =
          priceSnapshot != null ? Number(priceSnapshot) : Number(priceService);

        const percentSnapshot = appt.barberPercentageAtTheTime;
        const percentService = appt.service?.barberPercentage ?? 0;
        const percentNumber =
          percentSnapshot != null
            ? Number(percentSnapshot)
            : Number(percentService);

        commission = (priceNumber * percentNumber) / 100;
      }
    } else {
      // fallback: tenta inferir por item.service.barberPercentage (se existir)
      // (melhor do que nada; em geral o correto é vir pelo appointment)
      commission = serviceItems.reduce((sum: number, it: any) => {
        const total = Number(it.totalPrice ?? 0);
        const percent = it.service?.barberPercentage ?? 0;
        return sum + (total * Number(percent)) / 100;
      }, 0);
    }

    servicesGrossMonth += gross;
    servicesCommissionMonth += commission;
    servicesNetMonth += gross - commission;
  }

  // Produtos (lucro líquido = total - comissão do barbeiro)
  const productsGrossMonth = productSales.reduce(
    (acc, sale) => acc + Number(sale.totalPrice),
    0,
  );

  const productsCommissionMonth = productSales.reduce((acc, sale) => {
    const total = Number(sale.totalPrice);
    const percent = sale.product?.barberPercentage ?? 0;
    return acc + (total * percent) / 100;
  }, 0);

  const productsNetMonth = productsGrossMonth - productsCommissionMonth;

  // Faturamento líquido (serviços + produtos) e lucro final
  const netRevenueMonth = servicesNetMonth + productsNetMonth;
  const netIncome = netRevenueMonth - totalExpenses;

  const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

  const rawMonthLabel = format(referenceDate, "MMMM 'de' yyyy", {
    locale: ptBR,
  });
  const monthLabel =
    rawMonthLabel.charAt(0).toUpperCase() + rawMonthLabel.slice(1);

  const monthForForm = format(referenceDate, "yyyy-MM");

  // ============================
  // FATURAMENTO POR BARBEIRO
  // ============================
  const barberEarningsMap = new Map<string, BarberMonthlyEarnings>();

  barbers.forEach((barber: any) => {
    barberEarningsMap.set(barber.id, {
      barberId: barber.id,
      name: barber.name ?? "Barbeiro",
      email: barber.email ?? null,
      phone: barber.phone ?? null,
      servicesEarnings: 0,
      productsEarnings: 0,
    });
  });

  // Serviços (pelos pedidos pagos)
  for (const order of paidOrders) {
    const appt: any = order.appointment;
    if (!appt?.barberId) continue;

    const entry = barberEarningsMap.get(appt.barberId);
    if (!entry) continue;

    let commission = 0;

    const earningSnapshot = appt.barberEarningValue;
    if (earningSnapshot != null) {
      commission = Number(earningSnapshot);
    } else {
      const priceSnapshot = appt.servicePriceAtTheTime;
      const priceService = appt.service?.price ?? 0;
      const priceNumber =
        priceSnapshot != null ? Number(priceSnapshot) : Number(priceService);

      const percentSnapshot = appt.barberPercentageAtTheTime;
      const percentService = appt.service?.barberPercentage ?? 0;
      const percentNumber =
        percentSnapshot != null
          ? Number(percentSnapshot)
          : Number(percentService);

      commission = (priceNumber * percentNumber) / 100;
    }

    entry.servicesEarnings += commission;
  }

  // Produtos (comissões do mês)
  productSales.forEach((sale: any) => {
    if (!sale.barberId) return;
    const entry = barberEarningsMap.get(sale.barberId);
    if (!entry) return;

    const total = Number(sale.totalPrice);
    const percent = sale.product?.barberPercentage ?? 0;
    const commission = (total * percent) / 100;

    entry.productsEarnings += commission;
  });

  const barberEarningsList: BarberMonthlyEarnings[] = Array.from(
    barberEarningsMap.values(),
  ).sort((a, b) => a.name.localeCompare(b.name));

  const canCreateExpense = !!activeUnitId;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* HEADER + SELETOR DE MÊS */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-title text-content-primary">Financeiro</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Visão geral do faturamento, despesas e lucro da barbearia.
          </p>
          <p className="text-paragraph-small text-content-secondary">
            Mês selecionado: <span className="font-medium">{monthLabel}</span>
          </p>

          {!canCreateExpense && (
            <p className="mt-1 text-paragraph-small text-content-tertiary">
              Para cadastrar despesas, selecione uma unidade (você está em
              “Todas”).
            </p>
          )}
        </div>

        <div className="flex items-center gap-4">
          <MonthPicker />
          <NewExpenseDialog
            month={monthForForm}
            unitId={activeUnitId}
            disabled={!canCreateExpense}
          />
        </div>
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
