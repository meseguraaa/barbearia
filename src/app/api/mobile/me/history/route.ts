// app/api/mobile/me/history/route.ts
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
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

function formatDate(d: Date) {
  // no histórico completo, prefiro sempre data completa (sem "Hoje/Ontem")
  return format(d, "dd/MM/yyyy • HH:mm", { locale: ptBR });
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(req: Request) {
  try {
    const me = await requireMobileAuth(req);
    const clientId = me.sub;

    // MVP: traz uma quantidade boa. Depois a gente pagina se quiser.
    const TAKE = 50;

    const [doneAppointments, canceledAppointments, orders] = await Promise.all([
      prisma.appointment.findMany({
        where: { clientId, status: "DONE" },
        orderBy: { scheduleAt: "desc" },
        take: TAKE,
        include: { barber: true, service: true },
      }),
      prisma.appointment.findMany({
        where: { clientId, status: "CANCELED" },
        orderBy: { scheduleAt: "desc" },
        take: TAKE,
        include: { barber: true, service: true },
      }),
      prisma.order.findMany({
        where: { clientId },
        orderBy: { createdAt: "desc" },
        take: TAKE,
        include: {
          items: {
            include: { product: true, service: true },
          },
        },
      }),
    ]);

    const productOrders = orders.filter((order) =>
      order.items.some((item) => item.productId != null),
    );

    const done: HistoryItem[] = doneAppointments.map((appt) => {
      const d = new Date(appt.scheduleAt);
      const barberPart = appt.barber?.name ? ` • ${appt.barber.name}` : "";

      return {
        id: `appt:${appt.id}`,
        title: appt.description || appt.service?.name || "Serviço",
        description: `Concluído${barberPart}`,
        date: formatDate(d),
        icon: "scissors",
      };
    });

    const canceled: HistoryItem[] = canceledAppointments.map((appt) => {
      const d = new Date(appt.scheduleAt);
      const barberPart = appt.barber?.name ? ` • ${appt.barber.name}` : "";

      return {
        id: `appt:${appt.id}`,
        title: appt.description || appt.service?.name || "Serviço",
        description: `Cancelado${barberPart}`,
        date: formatDate(d),
        icon: "calendar",
      };
    });

    const ordersItems: HistoryItem[] = productOrders.map((order) => {
      const d = new Date(order.createdAt);

      const itemsLabel = order.items
        .filter((i) => i.productId != null)
        .map((i) => `${i.quantity}x ${i.product?.name ?? "Produto"}`)
        .join(", ");

      // status em pt-br simples (MVP)
      const statusLabel =
        order.status === "COMPLETED"
          ? "Concluído"
          : order.status === "PENDING_CHECKIN"
            ? "Reservado"
            : order.status === "EXPIRED"
              ? "Expirado"
              : order.status === "CANCELED"
                ? "Cancelado"
                : String(order.status || "Pedido");

      return {
        id: `order:${order.id}`,
        title: `Pedido #${String(order.id).slice(0, 8)}`,
        description: itemsLabel
          ? `${statusLabel} • ${itemsLabel}`
          : `${statusLabel} • Compra de produto`,
        date: formatDate(d),
        icon: "shopping-bag",
      };
    });

    return NextResponse.json(
      { ok: true, done, canceled, orders: ordersItems },
      { headers: corsHeaders() },
    );
  } catch (err: any) {
    const message = err?.message || "Erro inesperado";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 401, headers: corsHeaders() },
    );
  }
}
