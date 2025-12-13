// src/app/components/open-accounts-section.tsx
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { OrderStatus } from "@prisma/client";

import { OrderStatusBadge } from "@/components/order-status-badge";
import { Button } from "@/components/ui/button";

type BarberOption = { id: string; name: string };

type ServiceOrder = {
  id: string;
  status: OrderStatus;
  totalAmount: any;
  createdAt: Date;
  clientId?: string | null;
  client: { id?: string; name: string | null; email?: string | null } | null;
  items: Array<{
    id: string;
    quantity: number;
    serviceId: string | null;
    service: { name: string } | null;
  }>;
  appointment: {
    scheduleAt: Date;
    barber: { name: string | null } | null;
    service: { name: string | null } | null;
  } | null;
};

type ProductOrder = {
  id: string;
  status: OrderStatus;
  totalAmount: any;
  createdAt: Date;
  clientId?: string | null;
  client: { id?: string; name: string | null; email?: string | null } | null;
  items: Array<{
    id: string;
    quantity: number;
    productId: string | null;
    product: { name: string } | null;
  }>;
};

export type ClientOpenAccount = {
  clientId: string;
  clientLabel: string;
  clientEmail?: string | null; // ✅ novo: para resolver duplicados no actions
  latestCreatedAt: Date;
  serviceOrders: ServiceOrder[];
  productOrders: ProductOrder[];
  totalAmount: number;
  totalServices: number;
  totalProducts: number;
  hasProducts: boolean;
};

function formatBRL(value: number) {
  return (value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function getClientLabel(orderClient: any) {
  return orderClient?.name || orderClient?.email || "Cliente não identificado";
}

function getClientEmail(orderClient: any): string | null {
  const email = (orderClient?.email as string | null | undefined) ?? null;
  if (!email) return null;
  const trimmed = email.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function isGroupedAccount(x: any): x is ClientOpenAccount {
  return (
    x &&
    typeof x === "object" &&
    typeof x.clientId === "string" &&
    Array.isArray(x.serviceOrders) &&
    Array.isArray(x.productOrders) &&
    x.latestCreatedAt instanceof Date
  );
}

/**
 * 🛡️ Blindagem:
 * - Se `openAccounts` já vier agrupado, usa.
 * - Se vier como lista crua de pedidos, reagrupa por clientId aqui dentro.
 *
 * ✅ Extra: captura clientEmail (se existir) para a action resolver duplicados.
 */
function normalizeOpenAccounts(openAccounts: any[]): ClientOpenAccount[] {
  if (!openAccounts || openAccounts.length === 0) return [];

  // Já agrupado? usa direto.
  if (openAccounts.every(isGroupedAccount)) {
    // Se vier agrupado sem clientEmail, tentamos inferir a partir das orders internas
    return (openAccounts as ClientOpenAccount[]).map((acc) => {
      if (acc.clientEmail) return acc;

      const emailFromService = acc.serviceOrders
        .map((o) => getClientEmail(o.client))
        .find(Boolean);

      const emailFromProduct = acc.productOrders
        .map((o) => getClientEmail(o.client))
        .find(Boolean);

      return {
        ...acc,
        clientEmail: emailFromService || emailFromProduct || null,
      };
    });
  }

  // Caso venha “cru”: tentamos reagrupar por clientId
  const accountsMap = new Map<string, ClientOpenAccount>();

  for (const maybeOrder of openAccounts as Array<ServiceOrder | ProductOrder>) {
    const clientId = (maybeOrder as any).clientId as string | null | undefined;
    if (!clientId) continue;

    const label = getClientLabel((maybeOrder as any).client);
    const email = getClientEmail((maybeOrder as any).client);
    const createdAt = (maybeOrder as any).createdAt as Date;
    const total = Number((maybeOrder as any).totalAmount ?? 0);

    const hasServiceItems =
      Array.isArray((maybeOrder as any).items) &&
      (maybeOrder as any).items.some((it: any) => it?.serviceId != null);

    const hasProductItems =
      Array.isArray((maybeOrder as any).items) &&
      (maybeOrder as any).items.some((it: any) => it?.productId != null);

    const existing = accountsMap.get(clientId);

    if (!existing) {
      accountsMap.set(clientId, {
        clientId,
        clientLabel: label,
        clientEmail: email,
        latestCreatedAt: createdAt,
        serviceOrders: hasServiceItems ? [maybeOrder as ServiceOrder] : [],
        productOrders: hasProductItems ? [maybeOrder as ProductOrder] : [],
        totalAmount: total,
        totalServices: hasServiceItems ? total : 0,
        totalProducts: hasProductItems ? total : 0,
        hasProducts: hasProductItems,
      });
    } else {
      // soma e empilha
      existing.totalAmount += total;

      if (hasServiceItems) {
        existing.serviceOrders.push(maybeOrder as ServiceOrder);
        existing.totalServices += total;
      }

      if (hasProductItems) {
        existing.productOrders.push(maybeOrder as ProductOrder);
        existing.totalProducts += total;
        existing.hasProducts = true;
      }

      if (createdAt > existing.latestCreatedAt) {
        existing.latestCreatedAt = createdAt;
      }

      if (existing.clientLabel === "Cliente não identificado" && label) {
        existing.clientLabel = label;
      }

      // ✅ se não tinha email ainda, tenta preencher
      if (!existing.clientEmail && email) {
        existing.clientEmail = email;
      }
    }
  }

  return Array.from(accountsMap.values()).sort(
    (a, b) => b.latestCreatedAt.getTime() - a.latestCreatedAt.getTime(),
  );
}

export function OpenAccountsSection({
  openAccounts,
  openAccountsCount: _openAccountsCount,
  barbers,
  hasBarbers,
  redirectTo,

  orphanServiceOrders,
  orphanProductOrders,

  finalizeClientOpenOrders,
  cancelClientOpenOrders,
  finalizeProductOrder,
  cancelProductOrder,
  finalizeServiceOrder,
  cancelServiceOrder,
}: {
  openAccounts: ClientOpenAccount[] | any[];
  openAccountsCount: number; // (mantido por compatibilidade, mas ignorado)
  barbers: BarberOption[];
  hasBarbers: boolean;
  redirectTo: string;

  orphanServiceOrders: ServiceOrder[];
  orphanProductOrders: ProductOrder[];

  finalizeClientOpenOrders: (formData: FormData) => Promise<void>;
  cancelClientOpenOrders: (formData: FormData) => Promise<void>;
  finalizeProductOrder: (formData: FormData) => Promise<void>;
  cancelProductOrder: (formData: FormData) => Promise<void>;
  finalizeServiceOrder: (formData: FormData) => Promise<void>;
  cancelServiceOrder: (formData: FormData) => Promise<void>;
}) {
  const normalizedAccounts = normalizeOpenAccounts(openAccounts as any[]);
  const openAccountsCount = normalizedAccounts.length;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-subtitle text-content-primary">
          Contas em aberto{" "}
          <span className="text-content-secondary font-normal">
            ({openAccountsCount})
          </span>
        </h2>
      </div>

      {normalizedAccounts.length === 0 ? (
        <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-6">
          <p className="text-paragraph-small text-content-secondary text-center">
            Não há contas aguardando pagamento no momento.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {normalizedAccounts.map((account) => {
            const createdAtStr = format(
              account.latestCreatedAt,
              "dd/MM/yyyy 'às' HH:mm",
              { locale: ptBR },
            );

            const totalStr = formatBRL(account.totalAmount);
            const totalServicesStr = formatBRL(account.totalServices);
            const totalProductsStr = formatBRL(account.totalProducts);

            return (
              <div
                key={`${account.clientId}-${account.latestCreatedAt.getTime()}`}
                className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-3"
              >
                {/* HEADER: CLIENTE + TOTAL */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-paragraph-small text-content-primary truncate">
                      Cliente:{" "}
                      <span className="font-medium">{account.clientLabel}</span>
                    </p>
                    <p className="text-paragraph-small text-content-secondary">
                      Última movimentação em {createdAtStr}
                    </p>

                    <p className="text-paragraph-small text-content-secondary mt-1">
                      <span>
                        Serviços:{" "}
                        <span className="font-medium">{totalServicesStr}</span>
                      </span>
                      <span className="mx-2">•</span>
                      <span>
                        Produtos:{" "}
                        <span className="font-medium">{totalProductsStr}</span>
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
                                  Barbeiro: {barberNameFromAppt}
                                </p>
                                <p className="text-paragraph-small text-content-secondary">
                                  Serviços: {itemsLabel}
                                </p>
                              </div>

                              <div className="flex flex-col items-end gap-1">
                                <span className="text-paragraph-small font-semibold text-content-primary">
                                  {formatBRL(orderTotal)}
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

                        const createdAtStr2 = format(
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
                                  Criado em {createdAtStr2}
                                </p>
                                <p className="text-paragraph-small text-content-secondary">
                                  Produtos: {itemsLabel || "—"}
                                </p>
                              </div>

                              <div className="flex flex-col items-end gap-2">
                                <div className="flex flex-col items-end gap-1">
                                  <span className="text-paragraph-small font-semibold text-content-primary">
                                    {formatBRL(orderTotal)}
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
                          Barbeiro responsável pela venda dos produtos
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
                      {!!account.clientEmail && (
                        <input
                          type="hidden"
                          name="clientEmail"
                          value={
                            account.clientLabel.includes("@")
                              ? account.clientLabel
                              : ""
                          }
                        />
                      )}
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
                      {!!account.clientEmail && (
                        <input
                          type="hidden"
                          name="clientEmail"
                          value={
                            account.clientLabel.includes("@")
                              ? account.clientLabel
                              : ""
                          }
                        />
                      )}
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
                            Selecione o barbeiro
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

      {/* Fallback: pedidos sem clientId */}
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
                      Total {formatBRL(Number(order.totalAmount ?? 0))}
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
                      Total {formatBRL(Number(order.totalAmount ?? 0))}
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
  );
}
