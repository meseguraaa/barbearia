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

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Financeiro",
};

type AdminFinancePageProps = {
  searchParams: Promise<{
    month?: string; // formato "yyyy-MM"
  }>;
};

// ====== TIPO AUXILIAR: FATURAMENTO POR BARBEIRO ======
type BarberMonthlyEarnings = {
  barberId: string;
  name: string;
  email: string | null;
  phone: string | null;
  servicesEarnings: number;
  productsEarnings: number;
};

// ============ LÓGICA DE RECORRÊNCIA ============

async function seedRecurringExpensesForMonth(monthStart: Date, monthEnd: Date) {
  // Mês anterior
  const previousMonthStart = startOfMonth(addMonths(monthStart, -1));
  const previousMonthEnd = endOfMonth(previousMonthStart);

  // Todas as despesas recorrentes do mês anterior
  const lastMonthRecurringExpenses = await prisma.expense.findMany({
    where: {
      isRecurring: true,
      dueDate: {
        gte: previousMonthStart,
        lte: previousMonthEnd,
      },
    },
  });

  if (lastMonthRecurringExpenses.length === 0) return;

  const year = monthStart.getFullYear();
  const monthIndex = monthStart.getMonth(); // 0..11

  // Para cada despesa recorrente do mês anterior,
  // garante que exista UMA entrada equivalente neste mês.
  for (const expense of lastMonthRecurringExpenses) {
    const day = expense.dueDate.getDate();

    const sameSeriesThisMonth = await prisma.expense.findMany({
      where: {
        isRecurring: true,
        description: expense.description,
        dueDate: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
    });

    const alreadyExists = sameSeriesThisMonth.some(
      (e) => e.dueDate.getDate() === day,
    );

    if (alreadyExists) continue;

    // Cria a despesa para o mês atual com mesmo valor e dia
    await prisma.expense.create({
      data: {
        description: expense.description,
        category: expense.category,
        amount: expense.amount,
        isRecurring: true,
        isPaid: false,
        dueDate: new Date(year, monthIndex, day),
      },
    });
  }
}

export default async function AdminFinancePage({
  searchParams,
}: AdminFinancePageProps) {
  const resolvedSearchParams = await searchParams;
  const monthParam = resolvedSearchParams.month;

  // Data de referência: se vier ?month=yyyy-MM usa ela, senão hoje
  const referenceDate = monthParam
    ? parse(monthParam, "yyyy-MM", new Date())
    : new Date();

  const monthStart = startOfMonth(referenceDate);
  const monthEnd = endOfMonth(referenceDate);

  // Garante recorrência por série (mês a mês)
  await seedRecurringExpensesForMonth(monthStart, monthEnd);

  const [expenses, appointmentsDone, productSales, barbers] = await Promise.all(
    [
      // Despesas do mês
      prisma.expense.findMany({
        where: {
          dueDate: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
        orderBy: {
          dueDate: "asc",
        },
      }),
      // Appointments concluídos no mês para cálculos financeiros
      prisma.appointment.findMany({
        where: {
          status: "DONE",
          scheduleAt: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
        include: {
          service: true,
        },
      }),
      // Vendas de produtos do mês (todas, de todos os barbeiros)
      prisma.productSale.findMany({
        where: {
          soldAt: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
        include: {
          product: true,
          barber: true,
        },
      }),
      // Barbeiros ATIVOS (pra listar todos na seção)
      prisma.barber.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      }),
    ],
  );

  // ===== DESPESAS DO MÊS =====
  const totalExpenses = expenses.reduce((acc, expense) => {
    return acc + Number(expense.amount);
  }, 0);

  // ===== LUCRO BRUTO / LÍQUIDO DOS AGENDAMENTOS =====
  const { totalGrossMonth, totalNetMonth } = appointmentsDone.reduce(
    (acc, appt) => {
      const priceSnapshot = appt.servicePriceAtTheTime;
      const priceService = appt.service?.price ?? 0;
      const priceNumber = priceSnapshot
        ? Number(priceSnapshot)
        : Number(priceService);

      const percentSnapshot = appt.barberPercentageAtTheTime;
      const percentService = appt.service?.barberPercentage ?? 0;
      const percentNumber = percentSnapshot
        ? Number(percentSnapshot)
        : Number(percentService);

      const earningSnapshot = appt.barberEarningValue;
      const earningNumber = earningSnapshot
        ? Number(earningSnapshot)
        : (priceNumber * percentNumber) / 100;

      acc.totalGrossMonth += priceNumber;
      acc.totalNetMonth += priceNumber - earningNumber;

      return acc;
    },
    {
      totalGrossMonth: 0,
      totalNetMonth: 0,
    },
  );

  // Lucro líquido de agendamentos (após comissão)
  const appointmentsNetProfitMonth = totalNetMonth;

  // ===== LUCRO LÍQUIDO DE PRODUTOS =====
  const productsNetProfitMonth = productSales.reduce((acc, sale) => {
    const total = Number(sale.totalPrice);
    const percent = sale.product?.barberPercentage ?? 0;
    const commission = (total * percent) / 100;
    const net = total - commission;
    return acc + net;
  }, 0);

  // Lucro líquido final do mês:
  // lucro líquido agendamentos + lucro líquido produtos - despesas
  const netIncome =
    appointmentsNetProfitMonth + productsNetProfitMonth - totalExpenses;

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

  // ===== FATURAMENTO POR BARBEIRO (SERVIÇOS + PRODUTOS) =====
  const barberEarningsMap = new Map<string, BarberMonthlyEarnings>();

  // Inicializa mapa com todos os barbeiros ATIVOS
  barbers.forEach((barber) => {
    barberEarningsMap.set(barber.id, {
      barberId: barber.id,
      name: barber.name ?? "Barbeiro",
      email: barber.email ?? null,
      phone: barber.phone ?? null,
      servicesEarnings: 0,
      productsEarnings: 0,
    });
  });

  // Serviços (appointments) – soma da comissão do barbeiro (snapshot)
  appointmentsDone.forEach((appt) => {
    if (!appt.barberId) return;
    const entry = barberEarningsMap.get(appt.barberId);
    if (!entry) return;

    const priceSnapshot = appt.servicePriceAtTheTime;
    const priceService = appt.service?.price ?? 0;
    const priceNumber = priceSnapshot
      ? Number(priceSnapshot)
      : Number(priceService);

    const percentSnapshot = appt.barberPercentageAtTheTime;
    const percentService = appt.service?.barberPercentage ?? 0;
    const percentNumber = percentSnapshot
      ? Number(percentSnapshot)
      : Number(percentService);

    const earningSnapshot = appt.barberEarningValue;
    const earningNumber = earningSnapshot
      ? Number(earningSnapshot)
      : (priceNumber * percentNumber) / 100;

    entry.servicesEarnings += earningNumber;
  });

  // Produtos – comissão do barbeiro em cima das vendas
  productSales.forEach((sale) => {
    if (!sale.barberId) return;
    const entry = barberEarningsMap.get(sale.barberId);
    if (!entry) return;

    const total = Number(sale.totalPrice);
    const percent = sale.product?.barberPercentage ?? 0;
    const commission = (total * percent) / 100;

    entry.productsEarnings += commission;
  });

  // agora: TODOS barbeiros ativos aparecem, mesmo com 0 de faturamento
  const barberEarningsList: BarberMonthlyEarnings[] = Array.from(
    barberEarningsMap.values(),
  ).sort((a, b) => a.name.localeCompare(b.name));

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
        </div>

        <div className="flex items-center gap-4">
          <MonthPicker />
          <NewExpenseDialog month={monthForForm} />
        </div>
      </header>

      {/* RESUMO FINANCEIRO DO MÊS */}
      <section className="grid gap-4 md:grid-cols-3">
        {/* FATURAMENTO LÍQUIDO (SERVIÇOS + PRODUTOS) */}
        <div className="space-y-1 rounded-xl border border-border-primary bg-background-tertiary px-4 py-3">
          <p className="text-label-small text-content-secondary">
            Faturamento líquido (serviços + produtos)
          </p>
          <p className="text-title text-content-primary">
            {currencyFormatter.format(
              appointmentsNetProfitMonth + productsNetProfitMonth,
            )}
          </p>
          <p className="text-paragraph-small text-content-secondary">
            Serviços:{" "}
            <span className="font-semibold">
              {currencyFormatter.format(appointmentsNetProfitMonth)}
            </span>{" "}
            • Produtos:{" "}
            <span className="font-semibold">
              {currencyFormatter.format(productsNetProfitMonth)}
            </span>
          </p>
        </div>

        {/* DESPESAS */}
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

        {/* LUCRO LÍQUIDO FINAL */}
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
            Faturamento líquido (serviços + produtos) menos as despesas do mês.
          </p>
        </div>
      </section>

      {/* FATURAMENTO POR BARBEIRO NO MÊS */}
      <BarberMonthlyEarningsSection
        barbersEarnings={barberEarningsList}
        currencyFormatter={currencyFormatter}
      />

      {/* DESPESAS DO MÊS */}
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
          neste mês.
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

function NewExpenseDialog({ month }: { month: string }) {
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
            await createExpense(formData);
          }}
          className="space-y-4"
        >
          {/* mês atual da tela para as recorrentes */}
          <input type="hidden" name="month" value={month} />

          {/* se o backend ainda exige categoria, mandamos OTHER por padrão */}
          <input type="hidden" name="category" value="OTHER" />

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

          {/* RECORRENTE + CAMPOS DE VENCIMENTO */}
          <div className="space-y-3">
            {/* checkbox real (peer) */}
            <input
              id="isRecurring"
              name="isRecurring"
              type="checkbox"
              className="peer sr-only"
            />

            {/* UI do checkbox customizado (roxo com check branco) */}
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

            {/* Dia de vencimento para recorrentes */}
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

            {/* Data completa para não recorrentes */}
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
