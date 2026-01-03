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
  companyId: string; // ✅ multi-tenant obrigatório
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-company-id",
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
  if (!token) throw new Error("missing_token");

  const { payload } = await jwtVerify(token, getJwtSecretKey());

  const sub = String((payload as any)?.sub || "").trim();
  if (!sub) throw new Error("invalid_token");

  const companyId =
    typeof (payload as any)?.companyId === "string"
      ? String((payload as any).companyId).trim()
      : "";
  if (!companyId) throw new Error("companyId_missing_in_token");

  return {
    sub,
    role: (payload as any).role,
    email: (payload as any).email,
    name: (payload as any).name ?? null,
    companyId,
  };
}

function formatPreviewDate(d: Date) {
  if (isToday(d)) return `Hoje às ${format(d, "HH:mm", { locale: ptBR })}`;
  if (isYesterday(d)) return `Ontem às ${format(d, "HH:mm", { locale: ptBR })}`;
  return format(d, "dd/MM/yyyy • HH:mm", { locale: ptBR });
}

function safeDate(input: any) {
  const d = new Date(input ?? Date.now());
  return Number.isFinite(d.getTime()) ? d : new Date();
}

function pickApptOccurredAt(appt: any) {
  // ✅ no seu schema real: temos scheduleAt / updatedAt / createdAt
  const d = appt?.updatedAt ?? appt?.scheduleAt ?? appt?.createdAt;
  return safeDate(d);
}

function pickOrderOccurredAt(order: any) {
  const status = String(order?.status ?? "").toUpperCase();
  const isFinal =
    status === "COMPLETED" || status === "CANCELED" || status === "CANCELLED";
  const d = isFinal ? (order?.updatedAt ?? order?.createdAt) : order?.createdAt;
  return safeDate(d);
}

function safeStars(n: any) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v <= 0) return "";
  const clamped = Math.max(1, Math.min(5, Math.round(v)));
  return "★".repeat(clamped);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
  try {
    const me = await requireMobileAuth(req);

    if (me.role && me.role !== "CLIENT") {
      return NextResponse.json(
        { ok: false, error: "Sem permissão" },
        { status: 403, headers: corsHeaders() },
      );
    }

    const clientId = me.sub;
    const companyId = me.companyId;

    const canceledWherePrimary: any = {
      companyId,
      clientId,
      status: { in: ["CANCELED", "CANCELLED"] },
    };

    const canceledWhereFallback: any = {
      companyId,
      clientId,
      status: "CANCELED",
    };

    const [doneAppointments, canceledAppointments, orders, reviewedAppts] =
      await Promise.all([
        prisma.appointment.findMany({
          where: { companyId, clientId, status: "DONE" },
          orderBy: { scheduleAt: "desc" },
          take: 10,
          select: {
            id: true,
            scheduleAt: true,
            updatedAt: true,
            createdAt: true,
            description: true,
            barber: { select: { name: true } },
            service: { select: { name: true } },
          },
        }),

        (async () => {
          try {
            return await prisma.appointment.findMany({
              where: canceledWherePrimary,
              orderBy: { scheduleAt: "desc" },
              take: 10,
              select: {
                id: true,
                scheduleAt: true,
                updatedAt: true,
                createdAt: true,
                description: true,
                barber: { select: { name: true } },
                service: { select: { name: true } },
              },
            });
          } catch {
            return await prisma.appointment.findMany({
              where: canceledWhereFallback,
              orderBy: { scheduleAt: "desc" },
              take: 10,
              select: {
                id: true,
                scheduleAt: true,
                updatedAt: true,
                createdAt: true,
                description: true,
                barber: { select: { name: true } },
                service: { select: { name: true } },
              },
            });
          }
        })(),

        prisma.order.findMany({
          where: { companyId, clientId },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            items: {
              select: {
                quantity: true,
                productId: true,
                product: { select: { id: true, name: true } },
                service: { select: { name: true } },
              },
            },
          },
        }),

        prisma.appointment.findMany({
          where: {
            companyId,
            clientId,
            status: "DONE",
            review: { isNot: null },
          },
          orderBy: { updatedAt: "desc" },
          take: 10,
          select: {
            id: true,
            updatedAt: true,
            createdAt: true,
            description: true,
            barber: { select: { name: true } },
            service: { select: { name: true } },
            review: {
              select: {
                rating: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        }),
      ]);

    const productOrders = (orders as any[])
      .filter((order) =>
        order.items.some(
          (item: any) => item?.productId != null || item?.product?.id != null,
        ),
      )
      .filter((order) => {
        const st = String(order?.status ?? "").toUpperCase();
        return st !== "PENDING_CHECKIN";
      });

    const normalized: Array<{ occurredAt: Date; item: HistoryItem }> = [];

    for (const appt of doneAppointments as any[]) {
      const occurredAt = pickApptOccurredAt(appt);
      const barberPart = appt.barber?.name ? ` • ${appt.barber.name}` : "";

      normalized.push({
        occurredAt,
        item: {
          id: `done:${appt.id}`,
          title: appt.description || appt.service?.name || "Serviço",
          description: `Concluído${barberPart}`,
          date: formatPreviewDate(occurredAt),
          icon: "scissors",
        },
      });
    }

    for (const appt of canceledAppointments as any[]) {
      const occurredAt = pickApptOccurredAt(appt);
      const barberPart = appt.barber?.name ? ` • ${appt.barber.name}` : "";

      normalized.push({
        occurredAt,
        item: {
          id: `cancel:${appt.id}`,
          title: appt.description || appt.service?.name || "Serviço",
          description: `Cancelado${barberPart}`,
          date: formatPreviewDate(occurredAt),
          icon: "calendar",
        },
      });
    }

    for (const order of productOrders as any[]) {
      const occurredAt = pickOrderOccurredAt(order);

      const itemsLabel = order.items
        .filter((i: any) => i?.productId != null || i?.product?.id != null)
        .map((i: any) => `${i.quantity}x ${i.product?.name ?? "Produto"}`)
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
          date: formatPreviewDate(occurredAt),
          icon: "shopping-bag",
        },
      });
    }

    for (const appt of reviewedAppts as any[]) {
      const reviewAt = appt?.review?.createdAt ?? appt?.review?.updatedAt;
      const occurredAt = safeDate(reviewAt ?? appt.updatedAt ?? appt.createdAt);

      const barberName = appt.barber?.name || "Profissional";
      const serviceName =
        appt.service?.name || appt.description || "Atendimento";
      const ratingLabel = appt?.review?.rating
        ? safeStars(appt.review.rating)
        : "";

      normalized.push({
        occurredAt,
        item: {
          id: `review:${appt.id}`,
          title: "Avaliação enviada",
          description: ratingLabel
            ? `${barberName} • ${serviceName} • ${ratingLabel}`
            : `${barberName} • ${serviceName}`,
          date: formatPreviewDate(occurredAt),
          icon: "star",
        },
      });
    }

    normalized.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const items = normalized.slice(0, 5).map((x) => x.item);

    const _debug = {
      apptsTotal:
        (doneAppointments as any[]).length +
        (canceledAppointments as any[]).length,
      doneCount: (doneAppointments as any[]).length,
      canceledCount: (canceledAppointments as any[]).length,
      ordersTotal: (orders as any[]).length,
      productOrdersCount: productOrders.length,
      reviewsDoneCount: (reviewedAppts as any[]).length,
      normalizedCount: normalized.length,
      topTypes: items.map((it) => String(it.id).split(":")[0]),
      companyId,
    };

    return NextResponse.json(
      { ok: true, items, _debug },
      { status: 200, headers: corsHeaders() },
    );
  } catch (err: any) {
    const message = String(err?.message || "Erro inesperado").trim();
    const lower = message.toLowerCase();

    // ✅ auth só quando for claramente auth (não por "companyId" aparecer em query/stack)
    const isAuth =
      lower.includes("missing_token") ||
      lower.includes("invalid_token") ||
      lower.includes("jwt") ||
      lower.includes("signature") ||
      lower.includes("não autorizado") ||
      lower.includes("token ausente") ||
      lower.includes("companyid_missing_in_token");

    return NextResponse.json(
      {
        ok: false,
        error: isAuth ? "Não autorizado" : "Erro ao carregar histórico",
        _debug:
          process.env.NODE_ENV === "development"
            ? { where: "catch", message }
            : undefined,
      },
      { status: isAuth ? 401 : 500, headers: corsHeaders() },
    );
  }
}
