// app/api/mobile/me/history/preview/route.ts
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

type MobileTokenPayload = {
  sub: string;
  role?: "CLIENT" | "BARBER" | "ADMIN";
  email?: string;
  name?: string | null;
};

type HistoryItem = {
  id: string;
  title: string;
  description: string;
  date: string;
  icon: string;
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function getJwtSecretKey() {
  const secret = process.env.APP_JWT_SECRET;
  if (!secret) throw new Error("APP_JWT_SECRET não definido no .env");
  return new TextEncoder().encode(secret);
}

async function requireMobileAuth(req: Request): Promise<MobileTokenPayload> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) throw new Error("Token ausente");

  const { payload } = await jwtVerify(token, getJwtSecretKey());
  const sub = String(payload.sub || "");
  if (!sub) throw new Error("Token inválido");

  return {
    sub,
    role: (payload as any).role,
    email: (payload as any).email,
    name: (payload as any).name ?? null,
  };
}

function formatPreviewDate(d: Date) {
  if (isToday(d)) return `Hoje às ${format(d, "HH:mm", { locale: ptBR })}`;
  if (isYesterday(d)) return `Ontem às ${format(d, "HH:mm", { locale: ptBR })}`;
  return format(d, "dd/MM/yyyy • HH:mm", { locale: ptBR });
}

// ✅ data do EVENTO (ação), não do agendamento
function pickApptOccurredAt(appt: any) {
  // se no seu schema existir canceledAt/completedAt/finishedAt, ele usa
  const d =
    appt?.canceledAt ??
    appt?.cancelledAt ??
    appt?.completedAt ??
    appt?.finishedAt ??
    appt?.performedAt ??
    appt?.updatedAt ?? // ✅ normalmente existe e reflete quando mudou status
    appt?.scheduleAt;

  return new Date(d);
}

// ✅ pedidos: evento é quando mudou status (updatedAt) se já finalizou/cancelou
function pickOrderOccurredAt(order: any) {
  const status = String(order?.status ?? "").toUpperCase();

  const isFinal =
    status === "COMPLETED" || status === "CANCELED" || status === "CANCELLED";

  const d = isFinal ? (order?.updatedAt ?? order?.createdAt) : order?.createdAt;

  return new Date(d);
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(req: Request) {
  try {
    const me = await requireMobileAuth(req);
    const clientId = me.sub;

    const [doneAppointments, canceledAppointments, orders] = await Promise.all([
      prisma.appointment.findMany({
        where: { clientId, status: "DONE" },
        // ✅ ordem por scheduleAt não importa mais, vamos ordenar depois por occurredAt
        orderBy: { scheduleAt: "desc" },
        take: 10,
        include: { barber: true, service: true },
      }),
      prisma.appointment.findMany({
        where: { clientId, status: "CANCELED" },
        orderBy: { scheduleAt: "desc" },
        take: 10,
        include: { barber: true, service: true },
      }),
      prisma.order.findMany({
        where: { clientId },
        // ✅ pegamos vários e filtramos no JS (evita erro de enum)
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { items: { include: { product: true, service: true } } },
      }),
    ]);

    // ✅ só pedidos com produto e fora “sacolinha”
    const productOrders = orders
      .filter((order) =>
        order.items.some(
          (item: any) => item?.productId != null || item?.product?.id != null,
        ),
      )
      .filter((order) => {
        const st = String(order?.status ?? "").toUpperCase();
        // remove bag/sacolinha
        return st !== "PENDING_CHECKIN";
      });

    const normalized: Array<{ occurredAt: Date; item: HistoryItem }> = [];

    for (const appt of doneAppointments) {
      const occurredAt = pickApptOccurredAt(appt); // ✅ mudou aqui
      const barberPart = appt.barber?.name ? ` • ${appt.barber.name}` : "";

      normalized.push({
        occurredAt,
        item: {
          id: `done:${appt.id}`,
          title: appt.description || appt.service?.name || "Serviço",
          description: `Concluído${barberPart}`,
          date: formatPreviewDate(occurredAt), // ✅ data do evento
          icon: "scissors",
        },
      });
    }

    for (const appt of canceledAppointments) {
      const occurredAt = pickApptOccurredAt(appt); // ✅ mudou aqui
      const barberPart = appt.barber?.name ? ` • ${appt.barber.name}` : "";

      normalized.push({
        occurredAt,
        item: {
          id: `cancel:${appt.id}`,
          title: appt.description || appt.service?.name || "Serviço",
          description: `Cancelado${barberPart}`,
          date: formatPreviewDate(occurredAt), // ✅ data do evento
          icon: "calendar",
        },
      });
    }

    for (const order of productOrders) {
      const occurredAt = pickOrderOccurredAt(order); // ✅ mudou aqui

      const itemsLabel = order.items
        .filter((i: any) => i?.productId != null || i?.product?.id != null)
        .map((i) => `${i.quantity}x ${i.product?.name ?? "Produto"}`)
        .join(", ");

      const status = String(order.status ?? "").toUpperCase();
      const statusLabel =
        status === "COMPLETED"
          ? "Retirado"
          : status === "CANCELED" || status === "CANCELLED"
            ? "Cancelado"
            : "Pedido";

      normalized.push({
        occurredAt,
        item: {
          id: `order:${order.id}`,
          title: `Pedido #${String(order.id).slice(0, 8)}`,
          description: itemsLabel
            ? `${statusLabel} • ${itemsLabel}`
            : `${statusLabel} • Compra de produto`,
          date: formatPreviewDate(occurredAt), // ✅ data do evento
          icon: "shopping-bag",
        },
      });
    }

    // ✅ agora sim: ordem decrescente pelas ações (updatedAt/canceledAt/etc)
    normalized.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const items = normalized.slice(0, 5).map((x) => x.item);

    // (mantive seu debug que estava ajudando demais)
    const _debug = {
      apptsTotal: doneAppointments.length + canceledAppointments.length,
      doneCount: doneAppointments.length,
      canceledCount: canceledAppointments.length,
      ordersTotal: orders.length,
      productOrdersCount: productOrders.length,
      normalizedCount: normalized.length,
      topTypes: items.map((it) => String(it.id).split(":")[0]),
    };

    return NextResponse.json(
      { ok: true, items, _debug },
      { headers: corsHeaders() },
    );
  } catch (err: any) {
    const message = err?.message || "Erro inesperado";
    return NextResponse.json(
      { ok: false, error: message, _debug: { where: "catch", message } },
      { status: 401, headers: corsHeaders() },
    );
  }
}
