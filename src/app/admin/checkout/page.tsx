// app/admin/checkout/page.tsx
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

import { OrderStatusBadge } from "@/components/order-status-badge";
import { Button } from "@/components/ui/button";
import { format, parse, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  finalizeClientOpenOrders,
  cancelClientOpenOrders,
  finalizeProductOrder,
  cancelProductOrder,
  finalizeServiceOrder,
  cancelServiceOrder,
} from "./actions";
import { MonthPicker } from "@/components/month-picker";
import type { OrderStatus } from "@prisma/client";
import { requireAdminPermission } from "@/lib/admin-permissions";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Checkout",
};

type AdminCheckoutPageProps = {
  searchParams: Promise<{
    month?: string; // formato "yyyy-MM"
    page?: string; // "1", "2", ...
    pageSize?: string; // "10", "20", ...
  }>;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || Number.isNaN(n) || n <= 0) return fallback;
  return n;
}

export default async function AdminCheckoutPage({
  searchParams,
}: AdminCheckoutPageProps) {
  // 🔐 Permissão: apenas quem tem "Checkout" liberado (ou Dono)
  await requireAdminPermission("canAccessCheckout");

  const resolvedSearchParams = await searchParams;
  const monthParam = resolvedSearchParams.month;

  // Data de referência: se vier ?month=yyyy-MM usa ela, senão hoje
  const referenceDate = monthParam
    ? parse(monthParam, "yyyy-MM", new Date())
    : new Date();

  const monthStart = startOfMonth(referenceDate);
  const monthEnd = endOfMonth(referenceDate);

  // Paginação (somente "Pedidos do mês")
  const requestedPage = parsePositiveInt(resolvedSearchParams.page, 1);
  const rawPageSize = parsePositiveInt(resolvedSearchParams.pageSize, 20);
  const pageSize = clamp(rawPageSize, 5, 100);

  const ordersMonthWhere = {
    createdAt: {
      gte: monthStart,
      lte: monthEnd,
    },
  } as const;

  const [
    // 🔹 Pedidos de produtos aguardando retirada (fluxo antigo)
    pendingProductOrders,
    // 🔹 Pedidos de serviço aguardando checkout
    pendingServiceOrders,
    // 🔹 Profissionals para selecionar na venda de produto
    barbers,
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
  ]);

  const hasBarbers = barbers.length > 0;

  // ⭐ total count do mês (para paginação)
  const ordersForMonthCount = await prisma.order.count({
    where: ordersMonthWhere,
  });

  const totalPages = Math.max(1, Math.ceil(ordersForMonthCount / pageSize));
  const page = clamp(requestedPage, 1, totalPages);

  // ⭐ pedidos do mês paginados (usando page já "safe")
  const ordersForMonth = await prisma.order.findMany({
    where: ordersMonthWhere,
    include: {
      client: true,
      barber: true,
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
    orderBy: {
      createdAt: "desc",
    },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  // ✅ Redirect preservando filtros/página atuais
  const redirectParams = new URLSearchParams();
  if (monthParam) redirectParams.set("month", monthParam);
  redirectParams.set("page", String(page));
  redirectParams.set("pageSize", String(pageSize));
  const redirectTo = `/admin/checkout?${redirectParams.toString()}`;

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

  // ============================
  // CONTAS EM ABERTO (AGRUPADO)
  // ============================
  type PendingServiceOrder = (typeof pendingServiceOrders)[number];
  type PendingProductOrder = (typeof pendingProductOrders)[number];

  type ClientOpenAccount = {
    clientId: string;
    clientLabel: string;
    latestCreatedAt: Date;
    serviceOrders: PendingServiceOrder[];
    productOrders: PendingProductOrder[];
    totalAmount: number;
    totalServices: number;
    totalProducts: number;
    hasProducts: boolean;
  };

  const accountsMap = new Map<string, ClientOpenAccount>();
  const orphanServiceOrders: PendingServiceOrder[] = [];
  const orphanProductOrders: PendingProductOrder[] = [];

  function getClientLabel(orderClient: any) {
    return (
      orderClient?.name || orderClient?.email || "Cliente não identificado"
    );
  }

  for (const order of pendingServiceOrders) {
    const clientId = (order as any).clientId as string | null | undefined;
    if (!clientId) {
      orphanServiceOrders.push(order);
      continue;
    }

    const existing = accountsMap.get(clientId);
    const label = getClientLabel(order.client);
    const orderTotal = Number(order.totalAmount ?? 0);

    if (!existing) {
      accountsMap.set(clientId, {
        clientId,
        clientLabel: label,
        latestCreatedAt: order.createdAt,
        serviceOrders: [order],
        productOrders: [],
        totalAmount: orderTotal,
        totalServices: orderTotal,
        totalProducts: 0,
        hasProducts: false,
      });
    } else {
      existing.serviceOrders.push(order);
      existing.totalAmount += orderTotal;
      existing.totalServices += orderTotal;

      if (order.createdAt > existing.latestCreatedAt) {
        existing.latestCreatedAt = order.createdAt;
      }
      if (existing.clientLabel === "Cliente não identificado" && label) {
        existing.clientLabel = label;
      }
    }
  }

  for (const order of pendingProductOrders) {
    const clientId = (order as any).clientId as string | null | undefined;
    if (!clientId) {
      orphanProductOrders.push(order);
      continue;
    }

    const existing = accountsMap.get(clientId);
    const label = getClientLabel(order.client);
    const orderTotal = Number(order.totalAmount ?? 0);

    if (!existing) {
      accountsMap.set(clientId, {
        clientId,
        clientLabel: label,
        latestCreatedAt: order.createdAt,
        serviceOrders: [],
        productOrders: [order],
        totalAmount: orderTotal,
        totalServices: 0,
        totalProducts: orderTotal,
        hasProducts: true,
      });
    } else {
      existing.productOrders.push(order);
      existing.totalAmount += orderTotal;
      existing.totalProducts += orderTotal;
      existing.hasProducts = true;

      if (order.createdAt > existing.latestCreatedAt) {
        existing.latestCreatedAt = order.createdAt;
      }
      if (existing.clientLabel === "Cliente não identificado" && label) {
        existing.clientLabel = label;
      }
    }
  }

  const openAccounts = Array.from(accountsMap.values()).sort(
    (a, b) => b.latestCreatedAt.getTime() - a.latestCreatedAt.getTime(),
  );

  const openAccountsCount = openAccounts.length;

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
          1) CONTAS EM ABERTO (AGRUPADO POR CLIENTE)
          ================================ */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-subtitle text-content-primary">
            Contas em aberto{" "}
            <span className="text-content-secondary font-normal">
              ({openAccountsCount})
            </span>
          </h2>
        </div>

        {openAccounts.length === 0 ? (
          <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
            <p className="text-paragraph-small text-content-secondary text-center">
              Não há contas aguardando pagamento no momento.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {openAccounts.map((account) => {
              const createdAtStr = format(
                account.latestCreatedAt,
                "dd/MM/yyyy 'às' HH:mm",
                { locale: ptBR },
              );

              const totalStr = account.totalAmount.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
                minimumFractionDigits: 2,
              });

              const totalServicesStr = account.totalServices.toLocaleString(
                "pt-BR",
                {
                  style: "currency",
                  currency: "BRL",
                  minimumFractionDigits: 2,
                },
              );

              const totalProductsStr = account.totalProducts.toLocaleString(
                "pt-BR",
                {
                  style: "currency",
                  currency: "BRL",
                  minimumFractionDigits: 2,
                },
              );

              return (
                <div
                  key={account.clientId}
                  className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-3"
                >
                  {/* HEADER: CLIENTE + TOTAL */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-paragraph-small text-content-primary truncate">
                        Cliente:{" "}
                        <span className="font-medium">
                          {account.clientLabel}
                        </span>
                      </p>
                      <p className="text-paragraph-small text-content-secondary">
                        Última movimentação em {createdAtStr}
                      </p>

                      <p className="text-paragraph-small text-content-secondary mt-1">
                        <span>
                          Serviços:{" "}
                          <span className="font-medium">
                            {totalServicesStr}
                          </span>
                        </span>
                        <span className="mx-2">•</span>
                        <span>
                          Produtos:{" "}
                          <span className="font-medium">
                            {totalProductsStr}
                          </span>
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className="text-paragraph-small font-semibold text-content-primary">
                        Total a pagar: {totalStr}
                      </span>

                      <OrderStatusBadge status={"PENDING" as OrderStatus} />
                    </div>
                  </div>

                  {/* SERVIÇOS */}
                  {account.serviceOrders.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-border-primary">
                      <p className="text-label-small text-content-secondary">
                        Serviços pendentes
                      </p>

                      <div className="space-y-2">
                        {account.serviceOrders.map((order) => {
                          const apptTime = order.appointment
                            ? format(
                                order.appointment.scheduleAt,
                                "dd/MM/yyyy 'às' HH:mm",
                                { locale: ptBR },
                              )
                            : null;

                          const barberNameFromAppt =
                            order.appointment?.barber?.name ?? "—";

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

                          const orderTotal = Number(order.totalAmount ?? 0);

                          return (
                            <div
                              key={order.id}
                              className="rounded-lg border border-border-primary bg-background-secondary px-3 py-2"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-paragraph-small text-content-primary truncate">
                                    Atendimento #{order.id.slice(0, 8)}
                                  </p>
                                  {apptTime && (
                                    <p className="text-paragraph-small text-content-secondary">
                                      Atendimento em {apptTime}
                                    </p>
                                  )}
                                  <p className="text-paragraph-small text-content-secondary">
                                    Profissional: {barberNameFromAppt}
                                  </p>
                                  <p className="text-paragraph-small text-content-secondary">
                                    Serviços: {itemsLabel}
                                  </p>
                                </div>

                                <div className="flex flex-col items-end gap-1">
                                  <span className="text-paragraph-small font-semibold text-content-primary">
                                    {orderTotal.toLocaleString("pt-BR", {
                                      style: "currency",
                                      currency: "BRL",
                                      minimumFractionDigits: 2,
                                    })}
                                  </span>
                                  <OrderStatusBadge status={order.status} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* PRODUTOS */}
                  {account.productOrders.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-border-primary">
                      <p className="text-label-small text-content-secondary">
                        Produtos pendentes
                      </p>

                      <div className="space-y-2">
                        {account.productOrders.map((order) => {
                          const itemsLabel = order.items
                            .filter((item) => item.productId != null)
                            .map((item) => {
                              const name = item.product?.name ?? "Produto";
                              return `${item.quantity}x ${name}`;
                            })
                            .join(", ");

                          const orderTotal = Number(order.totalAmount ?? 0);

                          const createdAtStr = format(
                            order.createdAt,
                            "dd/MM/yyyy 'às' HH:mm",
                            { locale: ptBR },
                          );

                          return (
                            <div
                              key={order.id}
                              className="rounded-lg border border-border-primary bg-background-secondary px-3 py-2"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-paragraph-small text-content-primary truncate">
                                    Pedido (produto) #{order.id.slice(0, 8)}
                                  </p>
                                  <p className="text-paragraph-small text-content-secondary">
                                    Criado em {createdAtStr}
                                  </p>
                                  <p className="text-paragraph-small text-content-secondary">
                                    Produtos: {itemsLabel || "—"}
                                  </p>
                                </div>

                                <div className="flex flex-col items-end gap-2">
                                  <div className="flex flex-col items-end gap-1">
                                    <span className="text-paragraph-small font-semibold text-content-primary">
                                      {orderTotal.toLocaleString("pt-BR", {
                                        style: "currency",
                                        currency: "BRL",
                                        minimumFractionDigits: 2,
                                      })}
                                    </span>
                                    <OrderStatusBadge status={order.status} />
                                  </div>

                                  <form action={cancelProductOrder}>
                                    <input
                                      type="hidden"
                                      name="orderId"
                                      value={order.id}
                                    />
                                    <input
                                      type="hidden"
                                      name="redirectTo"
                                      value={redirectTo}
                                    />
                                    <Button
                                      type="submit"
                                      variant="outline"
                                      size="sm"
                                      className="text-red-500 border-red-500/40 hover:bg-red-500/5"
                                    >
                                      Cancelar produto
                                    </Button>
                                  </form>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* AÇÕES DA CONTA */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border-primary">
                    <div className="flex-1 min-w-0">
                      {account.hasProducts ? (
                        <>
                          <p className="text-label-small text-content-secondary mb-1">
                            Profissional responsável pela venda dos produtos
                          </p>
                          <p className="text-paragraph-small text-content-secondary">
                            Necessário para calcular faturamento e comissão das
                            vendas de produto.
                          </p>
                        </>
                      ) : (
                        <p className="text-paragraph-small text-content-secondary">
                          Esta conta tem apenas serviços. Você pode finalizar
                          direto.
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <form action={cancelClientOpenOrders}>
                        <input
                          type="hidden"
                          name="clientId"
                          value={account.clientId}
                        />
                        <input
                          type="hidden"
                          name="redirectTo"
                          value={redirectTo}
                        />
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          className="text-red-500 border-red-500/40 hover:bg-red-500/5"
                        >
                          Cancelar conta
                        </Button>
                      </form>

                      <form
                        action={finalizeClientOpenOrders}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <input
                          type="hidden"
                          name="clientId"
                          value={account.clientId}
                        />
                        <input
                          type="hidden"
                          name="redirectTo"
                          value={redirectTo}
                        />

                        {account.hasProducts && (
                          <select
                            name="barberId"
                            required
                            className="h-9 rounded-md border border-border-primary bg-background-secondary px-2 text-sm text-content-primary"
                            defaultValue=""
                            disabled={!hasBarbers}
                          >
                            <option value="" disabled>
                              Selecione o Profissional
                            </option>
                            {barbers.map((barber) => (
                              <option key={barber.id} value={barber.id}>
                                {barber.name}
                              </option>
                            ))}
                          </select>
                        )}

                        <Button
                          type="submit"
                          variant="brand"
                          size="sm"
                          disabled={account.hasProducts && !hasBarbers}
                        >
                          Marcar tudo como pago
                        </Button>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {(orphanServiceOrders.length > 0 || orphanProductOrders.length > 0) && (
          <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-4 space-y-2">
            <p className="text-paragraph-small text-content-secondary">
              Alguns pedidos pendentes não estão vinculados a um cliente e não
              podem ser agrupados automaticamente.
            </p>

            {orphanServiceOrders.length > 0 && (
              <div className="space-y-2">
                <p className="text-label-small text-content-secondary">
                  Atendimentos (sem cliente)
                </p>
                {orphanServiceOrders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-lg border border-border-primary bg-background-secondary px-3 py-2 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-paragraph-small text-content-primary truncate">
                        Atendimento #{order.id.slice(0, 8)}
                      </p>
                      <p className="text-paragraph-small text-content-secondary">
                        Total{" "}
                        {Number(order.totalAmount ?? 0).toLocaleString(
                          "pt-BR",
                          {
                            style: "currency",
                            currency: "BRL",
                          },
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <form action={cancelServiceOrder}>
                        <input type="hidden" name="orderId" value={order.id} />
                        <input
                          type="hidden"
                          name="redirectTo"
                          value={redirectTo}
                        />
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          className="text-red-500 border-red-500/40 hover:bg-red-500/5"
                        >
                          Cancelar
                        </Button>
                      </form>
                      <form action={finalizeServiceOrder}>
                        <input type="hidden" name="orderId" value={order.id} />
                        <input
                          type="hidden"
                          name="redirectTo"
                          value={redirectTo}
                        />
                        <Button type="submit" variant="brand" size="sm">
                          Pagar
                        </Button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {orphanProductOrders.length > 0 && (
              <div className="space-y-2">
                <p className="text-label-small text-content-secondary">
                  Produtos (sem cliente)
                </p>
                {orphanProductOrders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-lg border border-border-primary bg-background-secondary px-3 py-2 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-paragraph-small text-content-primary truncate">
                        Produto #{order.id.slice(0, 8)}
                      </p>
                      <p className="text-paragraph-small text-content-secondary">
                        Total{" "}
                        {Number(order.totalAmount ?? 0).toLocaleString(
                          "pt-BR",
                          {
                            style: "currency",
                            currency: "BRL",
                          },
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <form action={cancelProductOrder}>
                        <input type="hidden" name="orderId" value={order.id} />
                        <input
                          type="hidden"
                          name="redirectTo"
                          value={redirectTo}
                        />
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          className="text-red-500 border-red-500/40 hover:bg-red-500/5"
                        >
                          Cancelar
                        </Button>
                      </form>

                      <form
                        action={finalizeProductOrder}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="orderId" value={order.id} />
                        <input
                          type="hidden"
                          name="redirectTo"
                          value={redirectTo}
                        />

                        <select
                          name="barberId"
                          required
                          className="h-9 rounded-md border border-border-primary bg-background-secondary px-2 text-sm text-content-primary"
                          defaultValue=""
                          disabled={!hasBarbers}
                        >
                          <option value="" disabled>
                            Selecione o Profissional
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
                          Pagar
                        </Button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ================================
          2) PEDIDOS DO MÊS (AGRUPADO + DETALHADO POR ITEM)
          ================================ */}
      <OrdersSection
        orders={ordersForMonth}
        currencyFormatter={currencyFormatter}
        monthLabel={monthLabel}
        monthParam={monthParam}
        totalCount={ordersForMonthCount}
        page={page}
        pageSize={pageSize}
      />
    </div>
  );
}

/* ========= SEÇÃO: PEDIDOS DO MÊS ========= */

function OrdersSection({
  orders,
  currencyFormatter,
  monthLabel,
  monthParam,
  totalCount,
  page,
  pageSize,
}: {
  orders: Array<{
    id: string;
    status: OrderStatus;
    totalAmount: any;
    createdAt: Date;
    clientId?: string | null;
    client: { name: string | null; email?: string | null } | null;
    barber: { name: string | null } | null;
    appointment?: {
      scheduleAt: Date;
      barber?: { name: string | null } | null;
    } | null;
    items: Array<{
      id: string;
      quantity: number;
      unitPrice?: any;
      totalPrice?: any;
      service: { name: string } | null;
      product: { name: string } | null;
    }>;
  }>;
  currencyFormatter: Intl.NumberFormat;
  monthLabel: string;
  monthParam?: string;
  totalCount: number;
  page: number;
  pageSize: number;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  function buildHref(nextPage: number) {
    const params = new URLSearchParams();
    if (monthParam) params.set("month", monthParam);
    params.set("page", String(nextPage));
    params.set("pageSize", String(pageSize));
    return `?${params.toString()}`;
  }

  const range = getPaginationRange({
    currentPage: page,
    totalPages,
    siblingCount: 1,
  });

  function getClientLabel(order: (typeof orders)[number]) {
    return (
      order.client?.name || order.client?.email || "Cliente não identificado"
    );
  }

  // Agrupa pedidos por cliente (visão “extrato”)
  const grouped = orders.reduce<
    Record<
      string,
      {
        clientKey: string;
        clientLabel: string;
        latestAt: Date;
        orders: typeof orders;
        total: number;
        totalServices: number;
        totalProducts: number;
      }
    >
  >((acc, order) => {
    const clientKey = order.clientId ?? `no-client:${getClientLabel(order)}`;
    const label = getClientLabel(order);

    const serviceTotalForOrder = order.items
      .filter((i) => i.service)
      .reduce((sum, i) => sum + Number(i.totalPrice ?? 0), 0);

    const productTotalForOrder = order.items
      .filter((i) => i.product)
      .reduce((sum, i) => sum + Number(i.totalPrice ?? 0), 0);

    if (!acc[clientKey]) {
      acc[clientKey] = {
        clientKey,
        clientLabel: label,
        latestAt: order.createdAt,
        orders: [order],
        total: Number(order.totalAmount ?? 0),
        totalServices: serviceTotalForOrder,
        totalProducts: productTotalForOrder,
      };
    } else {
      acc[clientKey].orders.push(order);
      acc[clientKey].total += Number(order.totalAmount ?? 0);
      acc[clientKey].totalServices += serviceTotalForOrder;
      acc[clientKey].totalProducts += productTotalForOrder;

      if (order.createdAt > acc[clientKey].latestAt) {
        acc[clientKey].latestAt = order.createdAt;
      }
      if (acc[clientKey].clientLabel === "Cliente não identificado" && label) {
        acc[clientKey].clientLabel = label;
      }
    }

    return acc;
  }, {});

  const groups = Object.values(grouped).sort(
    (a, b) => b.latestAt.getTime() - a.latestAt.getTime(),
  );

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

          <p className="text-paragraph-small text-content-secondary mt-1">
            Mostrando{" "}
            <span className="font-medium">
              {totalCount === 0 ? 0 : (page - 1) * pageSize + 1}
            </span>{" "}
            a{" "}
            <span className="font-medium">
              {Math.min(page * pageSize, totalCount)}
            </span>{" "}
            de <span className="font-medium">{totalCount}</span>
          </p>
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
          <p className="text-paragraph-small text-content-secondary text-center">
            Nenhum pedido registrado neste mês ainda.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {groups.map((g) => {
              const latestStr = format(g.latestAt, "dd/MM/yyyy 'às' HH:mm", {
                locale: ptBR,
              });

              const totalStr = currencyFormatter.format(g.total);
              const servicesStr = currencyFormatter.format(g.totalServices);
              const productsStr = currencyFormatter.format(g.totalProducts);

              return (
                <div
                  key={g.clientKey}
                  className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-3"
                >
                  {/* Cabeçalho do grupo */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-paragraph-small text-content-primary truncate">
                        Cliente:{" "}
                        <span className="font-medium">{g.clientLabel}</span>
                      </p>
                      <p className="text-paragraph-small text-content-secondary">
                        Última movimentação em {latestStr}
                      </p>

                      <p className="text-paragraph-small text-content-secondary mt-1">
                        <span>
                          Serviços:{" "}
                          <span className="font-medium">{servicesStr}</span>
                        </span>
                        <span className="mx-2">•</span>
                        <span>
                          Produtos:{" "}
                          <span className="font-medium">{productsStr}</span>
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className="text-paragraph-small font-semibold text-content-primary">
                        Total no mês: {totalStr}
                      </span>
                      {/* Status aqui é apenas visual do grupo */}
                      <OrderStatusBadge status={"COMPLETED" as OrderStatus} />
                    </div>
                  </div>

                  {/* Pedidos do cliente (detalhado) */}
                  <div className="pt-2 border-t border-border-primary space-y-2">
                    <p className="text-label-small text-content-secondary">
                      Pedidos ({g.orders.length})
                    </p>

                    <div className="space-y-2">
                      {g.orders.map((order) => {
                        const createdAtStr = format(
                          order.createdAt,
                          "dd/MM/yyyy 'às' HH:mm",
                          { locale: ptBR },
                        );

                        const serviceItems = order.items.filter(
                          (i) => i.service,
                        );
                        const productItems = order.items.filter(
                          (i) => i.product,
                        );

                        const serviceSubtotal = serviceItems.reduce(
                          (sum, i) => sum + Number(i.totalPrice ?? 0),
                          0,
                        );
                        const productSubtotal = productItems.reduce(
                          (sum, i) => sum + Number(i.totalPrice ?? 0),
                          0,
                        );

                        const orderTotal = Number(order.totalAmount ?? 0);

                        const apptTime = order.appointment
                          ? format(
                              order.appointment.scheduleAt,
                              "dd/MM/yyyy 'às' HH:mm",
                              { locale: ptBR },
                            )
                          : null;

                        const barberName =
                          order.barber?.name ??
                          order.appointment?.barber?.name ??
                          "—";

                        return (
                          <details
                            key={order.id}
                            className="rounded-lg border border-border-primary bg-background-secondary px-3 py-2"
                          >
                            <summary className="cursor-pointer list-none">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-paragraph-small text-content-primary truncate">
                                    Pedido #{order.id.slice(0, 8)}
                                  </p>
                                  <p className="text-paragraph-small text-content-secondary">
                                    Criado em {createdAtStr}
                                  </p>
                                  {apptTime && (
                                    <p className="text-paragraph-small text-content-secondary">
                                      Atendimento em {apptTime}
                                    </p>
                                  )}
                                  <p className="text-paragraph-small text-content-secondary">
                                    Profissional: {barberName}
                                  </p>
                                </div>

                                <div className="flex flex-col items-end gap-1">
                                  <span className="text-paragraph-small font-semibold text-content-primary">
                                    {currencyFormatter.format(orderTotal)}
                                  </span>
                                  <OrderStatusBadge status={order.status} />
                                </div>
                              </div>
                            </summary>

                            {/* Conteúdo expandido */}
                            <div className="mt-3 space-y-3">
                              {/* Serviços */}
                              {serviceItems.length > 0 && (
                                <div className="space-y-2">
                                  <p className="text-label-small text-content-secondary">
                                    Serviços
                                  </p>

                                  <div className="overflow-x-auto rounded-lg border border-border-primary">
                                    <table className="min-w-full text-sm">
                                      <thead>
                                        <tr className="border-b border-border-primary bg-muted/40 text-left text-label-small text-content-secondary">
                                          <th className="px-3 py-2">Item</th>
                                          <th className="px-3 py-2 text-center">
                                            Qtd
                                          </th>
                                          <th className="px-3 py-2 text-right">
                                            Unit.
                                          </th>
                                          <th className="px-3 py-2 text-right">
                                            Total
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {serviceItems.map((it) => {
                                          const unit = Number(
                                            it.unitPrice ?? 0,
                                          );
                                          const total = Number(
                                            it.totalPrice ?? 0,
                                          );
                                          return (
                                            <tr
                                              key={it.id}
                                              className="border-t border-border-primary text-paragraph-small text-content-primary"
                                            >
                                              <td className="px-3 py-2">
                                                {it.service?.name ?? "Serviço"}
                                              </td>
                                              <td className="px-3 py-2 text-center">
                                                {it.quantity}
                                              </td>
                                              <td className="px-3 py-2 text-right">
                                                {currencyFormatter.format(unit)}
                                              </td>
                                              <td className="px-3 py-2 text-right">
                                                {currencyFormatter.format(
                                                  total,
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                        <tr className="border-t border-border-primary">
                                          <td
                                            className="px-3 py-2 text-right text-content-secondary"
                                            colSpan={3}
                                          >
                                            Subtotal serviços
                                          </td>
                                          <td className="px-3 py-2 text-right font-semibold text-content-primary">
                                            {currencyFormatter.format(
                                              serviceSubtotal,
                                            )}
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* Produtos */}
                              {productItems.length > 0 && (
                                <div className="space-y-2">
                                  <p className="text-label-small text-content-secondary">
                                    Produtos
                                  </p>

                                  <div className="overflow-x-auto rounded-lg border border-border-primary">
                                    <table className="min-w-full text-sm">
                                      <thead>
                                        <tr className="border-b border-border-primary bg-muted/40 text-left text-label-small text-content-secondary">
                                          <th className="px-3 py-2">Item</th>
                                          <th className="px-3 py-2 text-center">
                                            Qtd
                                          </th>
                                          <th className="px-3 py-2 text-right">
                                            Unit.
                                          </th>
                                          <th className="px-3 py-2 text-right">
                                            Total
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {productItems.map((it) => {
                                          const unit = Number(
                                            it.unitPrice ?? 0,
                                          );
                                          const total = Number(
                                            it.totalPrice ?? 0,
                                          );
                                          return (
                                            <tr
                                              key={it.id}
                                              className="border-t border-border-primary text-paragraph-small text-content-primary"
                                            >
                                              <td className="px-3 py-2">
                                                {it.product?.name ?? "Produto"}
                                              </td>
                                              <td className="px-3 py-2 text-center">
                                                {it.quantity}
                                              </td>
                                              <td className="px-3 py-2 text-right">
                                                {currencyFormatter.format(unit)}
                                              </td>
                                              <td className="px-3 py-2 text-right">
                                                {currencyFormatter.format(
                                                  total,
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                        <tr className="border-t border-border-primary">
                                          <td
                                            className="px-3 py-2 text-right text-content-secondary"
                                            colSpan={3}
                                          >
                                            Subtotal produtos
                                          </td>
                                          <td className="px-3 py-2 text-right font-semibold text-content-primary">
                                            {currencyFormatter.format(
                                              productSubtotal,
                                            )}
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Paginação */}
          <div className="flex flex-col gap-2 items-center">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href={buildHref(Math.max(1, page - 1))}
                    className={
                      page <= 1 ? "pointer-events-none opacity-50" : ""
                    }
                  />
                </PaginationItem>

                {range.map((item, idx) => {
                  if (item === "ellipsis") {
                    return (
                      <PaginationItem key={`e-${idx}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    );
                  }

                  return (
                    <PaginationItem key={item}>
                      <PaginationLink
                        href={buildHref(item)}
                        isActive={item === page}
                      >
                        {item}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}

                <PaginationItem>
                  <PaginationNext
                    href={buildHref(Math.min(totalPages, page + 1))}
                    className={
                      page >= totalPages ? "pointer-events-none opacity-50" : ""
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </>
      )}
    </section>
  );
}

function getPaginationRange(opts: {
  currentPage: number;
  totalPages: number;
  siblingCount?: number;
}) {
  const { currentPage, totalPages, siblingCount = 1 } = opts;

  if (totalPages <= 1) return [1];

  const totalNumbers = siblingCount * 2 + 5;
  if (totalNumbers >= totalPages) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
  const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

  const shouldShowLeftEllipsis = leftSiblingIndex > 2;
  const shouldShowRightEllipsis = rightSiblingIndex < totalPages - 1;

  const range: Array<number | "ellipsis"> = [];

  range.push(1);

  if (shouldShowLeftEllipsis) {
    range.push("ellipsis");
  } else {
    for (let p = 2; p < leftSiblingIndex; p++) range.push(p);
  }

  for (let p = leftSiblingIndex; p <= rightSiblingIndex; p++) {
    if (p !== 1 && p !== totalPages) range.push(p);
  }

  if (shouldShowRightEllipsis) {
    range.push("ellipsis");
  } else {
    for (let p = rightSiblingIndex + 1; p < totalPages; p++) range.push(p);
  }

  if (totalPages !== 1) range.push(totalPages);

  const cleaned: Array<number | "ellipsis"> = [];
  for (const item of range) {
    if (cleaned.length === 0) {
      cleaned.push(item);
      continue;
    }
    const prev = cleaned[cleaned.length - 1];
    if (item === prev) continue;
    cleaned.push(item);
  }

  return cleaned;
}
