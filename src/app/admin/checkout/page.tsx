// app/admin/checkout/page.tsx
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

import { OrderStatusBadge } from "@/components/order-status-badge";
import { Button } from "@/components/ui/button";
import { format, parse, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  finalizeProductOrder,
  cancelProductOrder,
  finalizeServiceOrder,
  cancelServiceOrder,
} from "./actions";
import { MonthPicker } from "@/components/month-picker";
import type { OrderStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Checkout",
};

type AdminCheckoutPageProps = {
  searchParams: Promise<{
    month?: string; // formato "yyyy-MM"
  }>;
};

export default async function AdminCheckoutPage({
  searchParams,
}: AdminCheckoutPageProps) {
  const resolvedSearchParams = await searchParams;
  const monthParam = resolvedSearchParams.month;

  // Data de referência: se vier ?month=yyyy-MM usa ela, senão hoje
  const referenceDate = monthParam
    ? parse(monthParam, "yyyy-MM", new Date())
    : new Date();

  const monthStart = startOfMonth(referenceDate);
  const monthEnd = endOfMonth(referenceDate);

  const [
    // 🔹 Pedidos de produtos aguardando retirada (fluxo antigo)
    pendingProductOrders,
    // 🔹 Pedidos de serviço aguardando checkout
    pendingServiceOrders,
    // 🔹 Barbeiros para selecionar na venda de produto
    barbers,
    // 🔹 Pedidos do mês (serviços + produtos)
    ordersForMonth,
  ] = await Promise.all([
    prisma.order.findMany({
      where: {
        status: "PENDING_CHECKIN",
        items: {
          some: {
            productId: {
              not: null,
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        client: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    }),

    prisma.order.findMany({
      where: {
        status: "PENDING",
        items: {
          some: {
            serviceId: {
              not: null,
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        client: true,
        items: {
          include: {
            service: true,
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

    prisma.barber.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
      },
    }),

    // ⭐ Pedidos (serviços + produtos) criados no mês selecionado
    prisma.order.findMany({
      where: {
        createdAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      include: {
        client: true,
        barber: true,
        items: {
          include: {
            service: true,
            product: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
  ]);

  const hasBarbers = barbers.length > 0;

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

  return (
    <div className="space-y-5 max-w-7xl">
      {/* HEADER GERAL */}
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title text-content-primary">Checkout</h1>
          <p className="text-paragraph-medium text-content-secondary">
            Finalize os pagamentos de atendimentos e pedidos de produtos.
          </p>
        </div>
        <MonthPicker />
      </header>

      {/* ================================
          1) CHECKOUT DE ATENDIMENTOS
          ================================ */}
      <section className="space-y-4">
        <h2 className="text-subtitle text-content-primary">
          Atendimentos aguardando checkout
        </h2>

        {pendingServiceOrders.length === 0 ? (
          <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
            <p className="text-paragraph-small text-content-secondary text-center">
              Não há atendimentos aguardando pagamento no momento.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingServiceOrders.map((order) => {
              const createdAtStr = format(
                order.createdAt,
                "dd/MM/yyyy 'às' HH:mm",
                { locale: ptBR },
              );

              const clientName =
                order.client?.name ||
                order.client?.email ||
                order.appointment?.clientName ||
                "Cliente não identificado";

              const appointmentTime = order.appointment
                ? format(
                    order.appointment.scheduleAt,
                    "dd/MM/yyyy 'às' HH:mm",
                    {
                      locale: ptBR,
                    },
                  )
                : null;

              const serviceItems = order.items.filter(
                (item) => item.serviceId != null,
              );

              const itemsLabel =
                serviceItems
                  .map((item) => {
                    const name = item.service?.name ?? "Serviço";
                    return `${item.quantity}x ${name}`;
                  })
                  .join(", ") || "Serviço do atendimento";

              const barberNameFromAppt = order.appointment?.barber?.name ?? "—";

              const totalAmountNumber = Number(order.totalAmount ?? 0);

              return (
                <div
                  key={order.id}
                  className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-3"
                >
                  {/* LINHA 1: ID + CLIENTE + STATUS */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-paragraph-small text-content-primary truncate">
                        Pedido (atendimento) #{order.id.slice(0, 8)}
                      </p>
                      <p className="text-paragraph-small text-content-secondary truncate">
                        Cliente:{" "}
                        <span className="font-medium">{clientName}</span>
                      </p>
                      {appointmentTime && (
                        <p className="text-paragraph-small text-content-secondary">
                          Atendimento em {appointmentTime}
                        </p>
                      )}
                      <p className="text-paragraph-small text-content-secondary">
                        Criado em {createdAtStr}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className="text-paragraph-small font-semibold text-content-primary">
                        Total:{" "}
                        {totalAmountNumber.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          minimumFractionDigits: 2,
                        })}
                      </span>
                      <OrderStatusBadge status={order.status} />
                    </div>
                  </div>

                  {/* LINHA 2: SERVIÇOS */}
                  {itemsLabel && (
                    <p className="text-paragraph-small text-content-secondary">
                      Serviços: {itemsLabel}
                    </p>
                  )}

                  {/* LINHA 3: BARBEIRO + AÇÕES */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border-primary">
                    <div className="flex-1 min-w-0">
                      <p className="text-label-small text-content-secondary mb-1">
                        Barbeiro responsável pelo atendimento
                      </p>
                      <p className="text-paragraph-small text-content-secondary">
                        {barberNameFromAppt}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {/* Cancelar pedido de serviço */}
                      <form action={cancelServiceOrder}>
                        <input type="hidden" name="orderId" value={order.id} />
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          className="text-red-500 border-red-500/40 hover:bg-red-500/5"
                        >
                          Cancelar checkout
                        </Button>
                      </form>

                      {/* Finalizar pagamento do serviço */}
                      <form action={finalizeServiceOrder}>
                        <input type="hidden" name="orderId" value={order.id} />
                        <Button type="submit" variant="brand" size="sm">
                          Marcar como pago
                        </Button>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ================================
          2) CHECKOUT DE PRODUTOS (EXISTENTE)
          ================================ */}
      <section className="space-y-4">
        <h2 className="text-subtitle text-content-primary">
          Pedidos de produtos aguardando checkout
        </h2>

        {pendingProductOrders.length === 0 ? (
          <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
            <p className="text-paragraph-small text-content-secondary text-center">
              Não há pedidos de produtos aguardando finalização no momento.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingProductOrders.map((order) => {
              const createdAtStr = format(
                order.createdAt,
                "dd/MM/yyyy 'às' HH:mm",
                { locale: ptBR },
              );

              const clientName =
                order.client?.name ||
                order.client?.email ||
                "Cliente não identificado";

              const itemsLabel = order.items
                .filter((item) => item.productId != null)
                .map((item) => {
                  const name = item.product?.name ?? "Produto";
                  return `${item.quantity}x ${name}`;
                })
                .join(", ");

              return (
                <div
                  key={order.id}
                  className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-3"
                >
                  {/* LINHA 1: ID + CLIENTE + STATUS */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-paragraph-small text-content-primary truncate">
                        Pedido (produto) #{order.id.slice(0, 8)}
                      </p>
                      <p className="text-paragraph-small text-content-secondary truncate">
                        Cliente:{" "}
                        <span className="font-medium">{clientName}</span>
                      </p>
                      <p className="text-paragraph-small text-content-secondary">
                        Criado em {createdAtStr}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className="text-paragraph-small font-semibold text-content-primary">
                        Total estimado:{" "}
                        {Number(order.totalAmount).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          minimumFractionDigits: 2,
                        })}
                      </span>
                      <OrderStatusBadge status={order.status} />
                    </div>
                  </div>

                  {/* LINHA 2: ITENS */}
                  {itemsLabel && (
                    <p className="text-paragraph-small text-content-secondary">
                      Produtos: {itemsLabel}
                    </p>
                  )}

                  {/* LINHA 3: AÇÕES + BARBEIRO */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border-primary">
                    <div className="flex-1 min-w-0">
                      <p className="text-label-small text-content-secondary mb-1">
                        Barbeiro responsável pela venda
                      </p>
                      <p className="text-paragraph-small text-content-secondary mb-1">
                        Esse barbeiro será usado para calcular o faturamento e a
                        comissão desta venda de produto.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {/* Cancelar pedido */}
                      <form action={cancelProductOrder}>
                        <input type="hidden" name="orderId" value={order.id} />
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          className="text-red-500 border-red-500/40 hover:bg-red-500/5"
                        >
                          Cancelar pedido
                        </Button>
                      </form>

                      {/* Finalizar venda com barbeiro */}
                      <form
                        action={finalizeProductOrder}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input type="hidden" name="orderId" value={order.id} />

                        <select
                          name="barberId"
                          required
                          className="h-9 rounded-md border border-border-primary bg-background-secondary px-2 text-sm text-content-primary"
                          defaultValue=""
                          disabled={!hasBarbers}
                        >
                          <option value="" disabled>
                            Selecione o barbeiro
                          </option>
                          {barbers.map((barber) => (
                            <option key={barber.id} value={barber.id}>
                              {barber.name}
                            </option>
                          ))}
                        </select>

                        <Button
                          type="submit"
                          variant="brand"
                          size="sm"
                          disabled={!hasBarbers}
                        >
                          Finalizar venda
                        </Button>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ================================
          3) PEDIDOS DO MÊS
          ================================ */}
      <OrdersSection
        orders={ordersForMonth}
        currencyFormatter={currencyFormatter}
        monthLabel={monthLabel}
      />
    </div>
  );
}

/* ========= SEÇÃO: PEDIDOS DO MÊS ========= */

function OrdersSection({
  orders,
  currencyFormatter,
  monthLabel,
}: {
  orders: Array<{
    id: string;
    status: OrderStatus;
    totalAmount: any;
    createdAt: Date;
    client: { name: string | null } | null;
    barber: { name: string | null } | null;
    items: Array<{
      id: string;
      quantity: number;
      service: { name: string } | null;
      product: { name: string } | null;
    }>;
  }>;
  currencyFormatter: Intl.NumberFormat;
  monthLabel: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-subtitle text-content-primary">Pedidos do mês</h2>
          <p className="text-paragraph-small text-content-secondary">
            Lista de todos os pedidos de serviços e produtos registrados neste
            mês.
            <br />
            Mês selecionado: <span className="font-medium">{monthLabel}</span>
          </p>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
          <p className="text-paragraph-small text-content-secondary text-center">
            Nenhum pedido registrado neste mês ainda.
          </p>
        </div>
      ) : (
        <section className="overflow-x-auto rounded-xl border border-border-primary bg-background-tertiary">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border-primary bg-muted/40 text-left text-label-small text-content-secondary">
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Barbeiro</th>
                <th className="px-4 py-2">Itens</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const dateStr = format(order.createdAt, "dd/MM/yyyy HH:mm", {
                  locale: ptBR,
                });

                const clientName = order.client?.name ?? "—";
                const barberName = order.barber?.name ?? "—";

                const itemsLabel =
                  order.items.length === 0
                    ? "—"
                    : order.items
                        .map((item) => {
                          const baseName =
                            item.service?.name ?? item.product?.name ?? "Item";
                          return `${item.quantity}x ${baseName}`;
                        })
                        .join(", ");

                return (
                  <tr
                    key={order.id}
                    className="border-t border-border-primary text-paragraph-small text-content-primary"
                  >
                    <td className="px-4 py-2 whitespace-nowrap">{dateStr}</td>
                    <td className="px-4 py-2">{clientName}</td>
                    <td className="px-4 py-2">{barberName}</td>
                    <td className="px-4 py-2">{itemsLabel}</td>
                    <td className="px-4 py-2 text-right">
                      {currencyFormatter.format(Number(order.totalAmount))}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <OrderStatusBadge status={order.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </section>
  );
}
