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
  return format(d, "dd/MM/yyyy • HH:mm", { locale: ptBR });
}

function safeStars(n: any) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v <= 0) return "";
  const clamped = Math.max(1, Math.min(5, Math.round(v)));
  return "★".repeat(clamped);
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders() });
}

export async function GET(req: Request) {
  try {
    const me = await requireMobileAuth(req);
    const clientId = me.sub;

    const TAKE = 50;

    const [doneAppointments, canceledAppointments, orders, reviewedAppts] =
      await Promise.all([
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
          where: { clientId, status: "COMPLETED" },
          orderBy: { createdAt: "desc" },
          take: TAKE,
          include: { items: { include: { product: true, service: true } } },
        }),
        // ✅ AVALIAÇÕES FEITAS: DONE e com review
        prisma.appointment.findMany({
          where: {
            clientId,
            status: "DONE",
            review: { isNot: null },
          },
          orderBy: { updatedAt: "desc" }, // (a gente ordena melhor no JS pela review.createdAt)
          take: TAKE,
          include: {
            barber: true,
            service: true,
            review: true,
          },
        }),
      ]);

    const productOrders = orders.filter((order) =>
      order.items.some(
        (item) => item.productId != null || item.product != null,
      ),
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
        .filter((i) => i.productId != null || i.product != null)
        .map((i) => `${i.quantity}x ${i.product?.name ?? "Produto"}`)
        .join(", ");

      return {
        id: `order:${order.id}`,
        title: `Pedido #${String(order.id).slice(0, 8)}`,
        description: itemsLabel
          ? `Retirado • ${itemsLabel}`
          : "Retirado • Compra de produto",
        date: formatDate(d),
        icon: "shopping-bag",
      };
    });

    // ✅ avaliações feitas (evento é a criação/atualização do review)
    const reviewsNormalized = reviewedAppts
      .map((appt: any) => {
        const reviewAt = appt?.review?.createdAt ?? appt?.review?.updatedAt;
        const occurredAt = reviewAt
          ? new Date(reviewAt)
          : new Date(appt.updatedAt);

        const barberName = appt.barber?.name || "Profissional";
        const serviceName =
          appt.service?.name || appt.description || "Atendimento";
        const ratingLabel = appt?.review?.rating
          ? safeStars(appt.review.rating)
          : "";

        return {
          occurredAt,
          item: {
            id: `review:${appt.id}`,
            title: "Avaliação enviada",
            description: ratingLabel
              ? `${barberName} • ${serviceName} • ${ratingLabel}`
              : `${barberName} • ${serviceName}`,
            date: formatDate(occurredAt),
            icon: "star",
          } as HistoryItem,
        };
      })
      .sort(
        (a: any, b: any) => b.occurredAt.getTime() - a.occurredAt.getTime(),
      );

    const reviews: HistoryItem[] = reviewsNormalized.map((x: any) => x.item);

    return NextResponse.json(
      { ok: true, reviews, done, canceled, orders: ordersItems },
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
