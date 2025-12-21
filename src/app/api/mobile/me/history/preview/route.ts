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

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(req: Request) {
  try {
    const me = await requireMobileAuth(req);
    const clientId = me.sub;

    // Pega um pouco mais de cada (10) pra garantir que a mistura final tenha 5 bons itens
    const [doneAppointments, canceledAppointments, orders] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          clientId,
          status: "DONE",
        },
        orderBy: { scheduleAt: "desc" },
        take: 10,
        include: {
          barber: true,
          service: true,
        },
      }),
      prisma.appointment.findMany({
        where: {
          clientId,
          status: "CANCELED",
        },
        orderBy: { scheduleAt: "desc" },
        take: 10,
        include: {
          barber: true,
          service: true,
        },
      }),
      prisma.order.findMany({
        where: {
          clientId,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          items: {
            include: {
              product: true,
              service: true,
            },
          },
        },
      }),
    ]);

    // Só pedidos que têm pelo menos 1 produto
    const productOrders = orders.filter((order) =>
      order.items.some((item) => item.productId != null),
    );

    // Normalize -> um array único pra ordenar por data
    const normalized: Array<{
      occurredAt: Date;
      item: HistoryItem;
    }> = [];

    for (const appt of doneAppointments) {
      const occurredAt = new Date(appt.scheduleAt);
      const barberPart = appt.barber?.name ? ` • ${appt.barber.name}` : "";

      normalized.push({
        occurredAt,
        item: {
          id: `appt:${appt.id}`,
          title: appt.description || appt.service?.name || "Serviço",
          description: `Concluído${barberPart}`,
          date: formatPreviewDate(occurredAt),
          icon: "scissors",
        },
      });
    }

    for (const appt of canceledAppointments) {
      const occurredAt = new Date(appt.scheduleAt);
      const barberPart = appt.barber?.name ? ` • ${appt.barber.name}` : "";

      normalized.push({
        occurredAt,
        item: {
          id: `appt:${appt.id}`,
          title: appt.description || appt.service?.name || "Serviço",
          description: `Cancelado${barberPart}`,
          date: formatPreviewDate(occurredAt),
          icon: "calendar",
        },
      });
    }

    for (const order of productOrders) {
      const occurredAt = new Date(order.createdAt);

      const itemsLabel = order.items
        .filter((i) => i.productId != null)
        .map((i) => `${i.quantity}x ${i.product?.name ?? "Produto"}`)
        .join(", ");

      normalized.push({
        occurredAt,
        item: {
          id: `order:${order.id}`,
          title: `Pedido #${String(order.id).slice(0, 8)}`,
          description: itemsLabel
            ? `Compra de produto • ${itemsLabel}`
            : "Compra de produto",
          date: formatPreviewDate(occurredAt),
          icon: "shopping-bag",
        },
      });
    }

    normalized.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const items = normalized.slice(0, 5).map((x) => x.item);

    return NextResponse.json({ ok: true, items }, { headers: corsHeaders() });
  } catch (err: any) {
    const message = err?.message || "Erro inesperado";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 401, headers: corsHeaders() },
    );
  }
}
