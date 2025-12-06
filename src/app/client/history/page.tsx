// app/client/history/page.tsx
import Link from "next/link";
import { getServerSession } from "next-auth";
import { nextAuthOptions } from "@/lib/nextauth";
import { prisma } from "@/lib/prisma";
import { format, parse, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { Button } from "@/components/ui/button";
import { MonthPicker } from "@/components/month-picker";

export const dynamic = "force-dynamic";

type ClientHistoryPageProps = {
  searchParams: Promise<{
    month?: string; // yyyy-MM
  }>;
};

export default async function ClientHistoryPage({
  searchParams,
}: ClientHistoryPageProps) {
  const session = await getServerSession(nextAuthOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="space-y-6 py-4">
          <h1 className="text-title text-content-primary">Histórico</h1>
          <p className="text-paragraph-medium-size text-content-secondary">
            Faça login para visualizar seus agendamentos e compras de produtos.
          </p>

          <Link href="/auth/login">
            <Button variant="brand">Entrar</Button>
          </Link>
        </div>
      </div>
    );
  }

  const resolvedSearchParams = await searchParams;
  const monthParam = resolvedSearchParams.month;

  // Data de referência: se vier ?month=yyyy-MM usa ela, senão hoje
  const referenceDate = monthParam
    ? parse(monthParam, "yyyy-MM", new Date())
    : new Date();

  const monthStart = startOfMonth(referenceDate);
  const monthEnd = endOfMonth(referenceDate);

  const [doneAppointments, canceledAppointments, orders] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        clientId: userId,
        status: "DONE",
        scheduleAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      orderBy: {
        scheduleAt: "desc",
      },
      include: {
        barber: true,
        service: true,
      },
    }),
    prisma.appointment.findMany({
      where: {
        clientId: userId,
        status: "CANCELED",
        scheduleAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      orderBy: {
        scheduleAt: "desc",
      },
      include: {
        barber: true,
        service: true,
      },
    }),
    prisma.order.findMany({
      where: {
        clientId: userId,
        createdAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        items: {
          include: {
            service: true,
            product: true,
          },
        },
      },
    }),
  ]);

  // só pedidos que têm pelo menos 1 produto
  const productOrders = orders.filter((order) =>
    order.items.some((item) => item.productId != null),
  );

  const currencyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

  // ========= TOTALIZADORES (SÓ DO MÊS ATUAL) =========
  const totalDoneServices = doneAppointments.reduce((acc, appt) => {
    const priceNumber = appt.servicePriceAtTheTime
      ? Number(appt.servicePriceAtTheTime)
      : appt.service
        ? Number(appt.service.price)
        : 0;

    return acc + priceNumber;
  }, 0);

  // ⭐ Produtos: só somar pedidos COMPLETED (venda de fato concluída)
  const totalProducts = productOrders.reduce((acc, order) => {
    if (order.status !== "COMPLETED") return acc;
    return acc + Number(order.totalAmount);
  }, 0);

  const grandTotal = totalDoneServices + totalProducts;

  const rawMonthLabel = format(referenceDate, "MMMM 'de' yyyy", {
    locale: ptBR,
  });
  const monthLabel =
    rawMonthLabel.charAt(0).toUpperCase() + rawMonthLabel.slice(1);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="space-y-6 py-4">
        {/* HEADER */}
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {/* ESQUERDA: TÍTULO + TEXTOS */}
          <div>
            <h1 className="text-title text-content-primary">Histórico</h1>

            <p className="text-content-secondary">
              Veja o que você fez em cada mês.
            </p>
            <p className="text-paragraph-small text-content-secondary">
              Mês selecionado: <span className="font-medium">{monthLabel}</span>
            </p>
          </div>

          {/* DIREITA: MONTH PICKER (data-month) */}
          <div className="md:self-start">
            <MonthPicker />
          </div>
        </header>

        {/* AGENDAMENTOS CONCLUÍDOS */}
        <section className="space-y-4">
          <p className="text-content-secondary">Serviços já realizados.</p>

          {doneAppointments.length === 0 ? (
            <p className="text-content-secondary">
              Você ainda não possui agendamentos concluídos neste mês.
            </p>
          ) : (
            <div className="space-y-2">
              {doneAppointments.map((appt) => {
                const dateStr = format(appt.scheduleAt, "dd/MM/yyyy", {
                  locale: ptBR,
                });
                const timeStr = format(appt.scheduleAt, "HH:mm", {
                  locale: ptBR,
                });

                const priceNumber = appt.servicePriceAtTheTime
                  ? Number(appt.servicePriceAtTheTime)
                  : appt.service
                    ? Number(appt.service.price)
                    : 0;

                const monthKey = format(appt.scheduleAt, "yyyy-MM");

                return (
                  <div
                    key={appt.id}
                    data-month={monthKey}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-primary bg-background-tertiary px-4 py-2.5"
                  >
                    {/* ESQUERDA: descrição + data + barbeiro */}
                    <div className="flex-1 min-w-0">
                      <p className="text-paragraph-small text-content-primary truncate">
                        {appt.description}
                      </p>
                      <p className="text-paragraph-small text-content-secondary truncate">
                        {dateStr} às {timeStr}
                        {appt.barber && (
                          <>
                            {" · "}Barbeiro:{" "}
                            <span className="font-medium">
                              {appt.barber.name}
                            </span>
                          </>
                        )}
                      </p>
                    </div>

                    {/* DIREITA: valor + status */}
                    <div className="flex items-center gap-3">
                      <span className="text-paragraph-small font-semibold text-content-primary whitespace-nowrap">
                        {currencyFormatter.format(priceNumber)}
                      </span>
                      <AppointmentStatusBadge status={appt.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* AGENDAMENTOS CANCELADOS */}
        <section className="space-y-3">
          <p className="text-content-secondary">
            Horários cancelados, com ou sem taxa.
          </p>

          {canceledAppointments.length === 0 ? (
            <p className="text-paragraph-small text-content-secondary mb-2">
              Você ainda não possui agendamentos cancelados neste mês.
            </p>
          ) : (
            <div className="space-y-2">
              {canceledAppointments.map((appt) => {
                const dateStr = format(appt.scheduleAt, "dd/MM/yyyy", {
                  locale: ptBR,
                });
                const timeStr = format(appt.scheduleAt, "HH:mm", {
                  locale: ptBR,
                });

                const priceNumber = appt.servicePriceAtTheTime
                  ? Number(appt.servicePriceAtTheTime)
                  : appt.service
                    ? Number(appt.service.price)
                    : 0;

                const monthKey = format(appt.scheduleAt, "yyyy-MM");

                return (
                  <div
                    key={appt.id}
                    data-month={monthKey}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-primary bg-background-tertiary px-4 py-2.5"
                  >
                    {/* ESQUERDA */}
                    <div className="flex-1 min-w-0">
                      <p className="text-paragraph-small text-content-primary truncate">
                        {appt.description}
                      </p>
                      <p className="text-paragraph-small text-content-secondary truncate">
                        {dateStr} às {timeStr}
                        {appt.barber && (
                          <>
                            {" · "}Barbeiro:{" "}
                            <span className="font-medium">
                              {appt.barber.name}
                            </span>
                          </>
                        )}
                      </p>
                    </div>

                    {/* DIREITA: valor + status */}
                    <div className="flex items-center gap-3">
                      <span className="text-paragraph-small font-semibold text-content-primary whitespace-nowrap">
                        {currencyFormatter.format(priceNumber)}
                      </span>
                      <AppointmentStatusBadge status={appt.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* COMPRAS / PEDIDOS DE PRODUTOS */}
        <section className="space-y-4">
          <p className="text-content-secondary">
            Histórico dos seus pedidos de produtos.
          </p>

          {productOrders.length === 0 ? (
            <div className="space-y-2">
              <p className="text-paragraph-small text-content-secondary">
                Você ainda não possui pedidos de produtos neste mês.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {productOrders.map((order) => {
                const dateStr = format(order.createdAt, "dd/MM/yyyy HH:mm", {
                  locale: ptBR,
                });

                const itemsLabel = order.items
                  .filter((item) => item.productId != null)
                  .map((item) => {
                    const name = item.product?.name ?? "Produto";
                    return `${item.quantity}x ${name}`;
                  })
                  .join(", ");

                const monthKey = format(order.createdAt, "yyyy-MM");

                const statusExtraText =
                  order.status === "PENDING_CHECKIN"
                    ? " · Aguardando sua visita na barbearia para finalizar a compra."
                    : order.status === "COMPLETED"
                      ? " · Compra concluída na barbearia."
                      : order.status === "CANCELED"
                        ? " · Pedido cancelado."
                        : "";

                return (
                  <div
                    key={order.id}
                    data-month={monthKey}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-primary bg-background-tertiary px-4 py-2.5"
                  >
                    {/* ESQUERDA */}
                    <div className="flex-1 min-w-0">
                      <p className="text-paragraph-small text-content-primary truncate">
                        Pedido #{order.id.slice(0, 8)}
                      </p>
                      <p className="text-paragraph-small text-content-secondary truncate">
                        {dateStr}
                        {itemsLabel && ` · ${itemsLabel}`}
                        {statusExtraText}
                      </p>
                    </div>

                    {/* DIREITA: valor + status */}
                    <div className="flex items-center gap-3">
                      <span className="text-paragraph-small font-semibold text-content-primary whitespace-nowrap">
                        {currencyFormatter.format(Number(order.totalAmount))}
                      </span>
                      <OrderStatusBadge status={order.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* TOTAL GERAL DO MÊS */}
        <section className="pt-4">
          <div className="rounded-xl border border-border-primary bg-background-tertiary px-4 py-3 space-y-1">
            <p className="text-paragraph-small text-content-secondary">
              Total em serviços concluídos no mês:{" "}
              <span className="font-semibold text-content-primary">
                {currencyFormatter.format(totalDoneServices)}
              </span>
            </p>
            <p className="text-paragraph-small text-content-secondary">
              Total em produtos no mês (somente compras concluídas):{" "}
              <span className="font-semibold text-content-primary">
                {currencyFormatter.format(totalProducts)}
              </span>
            </p>
            <p className="text-paragraph-small text-content-secondary">
              Total geral do mês:{" "}
              <span className="font-semibold text-content-primary">
                {currencyFormatter.format(grandTotal)}
              </span>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
