// src/app/api/admin/clients/search/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

const ADMIN_COMPANY_CONTEXT_COOKIE = "admin_company_context";
const SESSION_COOKIE_NAME = "painel_session";

type PainelSessionPayload = {
  sub: string;
  role: "CLIENT" | "BARBER" | "ADMIN";
  email?: string;
  name?: string | null;
};

function getJwtSecretKey() {
  const secret = process.env.PAINEL_JWT_SECRET;
  if (!secret) throw new Error("PAINEL_JWT_SECRET não definido no .env");
  return new TextEncoder().encode(secret);
}

function normalizePhone(phone: string): string {
  return String(phone ?? "").replace(/\D/g, "");
}

export async function GET(request: Request) {
  // ✅ Protege rota: apenas admin com permissão
  try {
    await requireAdminPermission("canAccessAppointments");
  } catch {
    return NextResponse.json({ clients: [] }, { status: 401 });
  }

  const cookieStore = await cookies();

  // ✅ Descobre o admin logado (pra validar membership na company do cookie)
  let actorUserId: string | null = null;
  try {
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (token) {
      const { payload } = await jwtVerify(token, getJwtSecretKey());
      const data = payload as unknown as PainelSessionPayload;
      actorUserId = data?.sub ?? null;
    }
  } catch (e) {
    console.error("[clients/search] painel_session inválido:", e);
  }

  // ✅ companyId do contexto
  const companyId = String(
    cookieStore.get(ADMIN_COMPANY_CONTEXT_COOKIE)?.value ?? "",
  ).trim();

  console.log(
    "[clients/search] ctx companyId:",
    companyId,
    "actorUserId:",
    actorUserId,
  );

  if (!companyId) {
    return NextResponse.json({ clients: [] }, { status: 400 });
  }

  // ✅ valida que o admin realmente pertence à company do cookie
  if (actorUserId) {
    const ok = await prisma.companyMember.findFirst({
      where: { userId: actorUserId, companyId, isActive: true } as any,
      select: { id: true } as any,
    });

    if (!ok?.id) {
      console.log(
        "[clients/search] actor NÃO pertence a esta company, bloqueando",
      );
      return NextResponse.json({ clients: [] }, { status: 403 });
    }
  }

  const { searchParams } = new URL(request.url);
  const rawQ = (searchParams.get("q") ?? "").trim();
  const rawTake = searchParams.get("take");
  const take = Math.max(1, Math.min(50, Number(rawTake ?? "20") || 20));

  if (!rawQ || rawQ.length < 2) {
    return NextResponse.json({ clients: [] });
  }

  const qLower = rawQ.toLowerCase();
  const phoneDigits = normalizePhone(rawQ);

  try {
    const where: any = {
      role: "CLIENT",
      isActive: true,

      // ✅ tenant-safe: User NÃO tem companyId, usa membership
      companyMemberships: {
        some: { companyId, isActive: true },
      },

      OR: [
        { name: { contains: rawQ, mode: "insensitive" } },
        { email: { contains: qLower, mode: "insensitive" } },
        ...(phoneDigits.length >= 3
          ? [
              { phone: { contains: phoneDigits } },
              { phone: { contains: rawQ } }, // fallback se alguém salvou com máscara
            ]
          : []),
      ],
    };

    const clients = await prisma.user.findMany({
      where,
      orderBy: [{ name: "asc" }],
      take,
      select: {
        id: true,
        name: true,
        phone: true,
      },
    });

    console.log(
      "[clients/search] q:",
      rawQ,
      "digits:",
      phoneDigits,
      "found:",
      clients.length,
    );

    return NextResponse.json({
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name ?? "",
        phone: c.phone ?? "",
      })),
    });
  } catch (error) {
    console.error("Erro na rota /api/admin/clients/search:", error);
    return NextResponse.json({ clients: [] }, { status: 500 });
  }
}
