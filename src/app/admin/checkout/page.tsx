// app/admin/checkout/page.tsx
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

import { OrderStatusBadge } from "@/components/order-status-badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { finalizeProductOrder, cancelProductOrder } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin | Checkout",
};

export default async function AdminCheckoutPage() {
  // 🔹 Busca todos os pedidos de produtos aguardando finalização na barbearia
  const [pendingProductOrders, barbers] = await Promise.all([
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto py-4">
      {/* HEADER */}
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title text-content-primary">Checkout</h1>
          <p className="text-paragraph-medium text-content-secondary">
            Finalize aqui os pedidos de produtos feitos pelos clientes e dê
            baixa no estoque.
          </p>
          <p className="text-paragraph-small text-content-secondary">
            Esta lista mostra apenas pedidos de produtos com status{" "}
            <span className="font-medium">Aguardando retirada</span>.
          </p>
        </div>
      </header>

      {/* LISTAGEM DE PEDIDOS DE PRODUTOS */}
      <section className="space-y-4">
        <h2 className="text-subtitle text-content-primary">
          Pedidos de produtos aguardando checkout
        </h2>

        {!hasBarbers && (
          <p className="text-paragraph-small text-red-500">
            Nenhum barbeiro ativo encontrado. Cadastre ou ative pelo menos um
            barbeiro para conseguir finalizar vendas de produtos.
          </p>
        )}

        {pendingProductOrders.length === 0 ? (
          <p className="text-paragraph-small text-content-secondary">
            Não há pedidos de produtos aguardando finalização no momento.
          </p>
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
                        Pedido #{order.id.slice(0, 8)}
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
                    {/* Seleção de barbeiro para finalização */}
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
    </div>
  );
}
