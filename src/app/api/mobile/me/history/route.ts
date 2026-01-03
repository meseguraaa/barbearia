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

  const sub = String((payload as any)?.sub || "").trim();
  if (!sub) throw new Error("Token inválido");

  const companyId =
    typeof (payload as any)?.companyId === "string"
      ? String((payload as any).companyId).trim()
      : "";

  if (!companyId) throw new Error("companyId ausente no token");

  return {
    sub,
    role: (payload as any).role,
    email: (payload as any).email,
    name: (payload as any).name ?? null,
    companyId,
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

    const TAKE = 50;

    const [doneAppointments, canceledAppointments, orders, reviewedAppts] =
      await Promise.all([
        prisma.appointment.findMany({
          where: { companyId, clientId, status: "DONE" }, // ✅ tenant scope
          orderBy: { scheduleAt: "desc" },
          take: TAKE,
          select: {
            id: true,
            scheduleAt: true,
            description: true,
            barber: { select: { name: true } },
            service: { select: { name: true } },
          },
        }),
        prisma.appointment.findMany({
          where: { companyId, clientId, status: "CANCELED" }, // ✅ tenant scope
          orderBy: { scheduleAt: "desc" },
          take: TAKE,
          select: {
            id: true,
            scheduleAt: true,
            description: true,
            barber: { select: { name: true } },
            service: { select: { name: true } },
          },
        }),
        prisma.order.findMany({
          where: { companyId, clientId, status: "COMPLETED" }, // ✅ tenant scope
          orderBy: { createdAt: "desc" },
          take: TAKE,
          select: {
            id: true,
            createdAt: true,
            items: {
              select: {
                quantity: true,
                productId: true,
                product: { select: { name: true } },
                service: { select: { name: true } },
              },
            },
          },
        }),
        // ✅ AVALIAÇÕES FEITAS: DONE e com review (tenant-safe)
        prisma.appointment.findMany({
          where: {
            companyId, // ✅ tenant scope
            clientId,
            status: "DONE",
            review: { isNot: null },
          },
          orderBy: { updatedAt: "desc" }, // (a gente ordena melhor no JS pela review.createdAt)
          take: TAKE,
          select: {
            id: true,
            updatedAt: true,
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
      { status: 200, headers: corsHeaders() },
    );
  } catch (err: any) {
    const message = err?.message || "Erro inesperado";

    const lower = String(message).toLowerCase();
    const isAuth =
      lower.includes("token") ||
      lower.includes("jwt") ||
      lower.includes("signature") ||
      lower.includes("companyid") ||
      lower.includes("ausente");

    return NextResponse.json(
      {
        ok: false,
        error: isAuth ? "Não autorizado" : "Erro ao carregar histórico",
      },
      { status: isAuth ? 401 : 500, headers: corsHeaders() },
    );
  }
}
