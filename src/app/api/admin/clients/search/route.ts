// src/app/api/admin/clients/search/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminPermission } from "@/lib/admin-permissions";

/**
 * GET /api/admin/clients/search?q=joa&take=20
 *
 * Retorna lista enxuta de clientes (users com role CLIENT),
 * para autocomplete no agendamento do ADMIN.
 *
 * - Busca por nome (contains, case-insensitive)
 * - Também tenta por telefone (contains) se houver
 * - Limita por take (default 20, máx 50)
 */
export async function GET(request: Request) {
  // ✅ Protege rota: apenas admin com permissão
  try {
    await requireAdminPermission("canAccessAppointments");
  } catch {
    return NextResponse.json({ clients: [] }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  const rawQ = (searchParams.get("q") ?? "").trim();
  const rawTake = searchParams.get("take");

  const take = Math.max(1, Math.min(50, Number(rawTake ?? "20") || 20));

  // Query curta demais: devolve vazio (evita varrer tabela)
  if (!rawQ || rawQ.length < 2) {
    return NextResponse.json({ clients: [] });
  }

  // Normaliza para busca por telefone também
  const phoneDigits = rawQ.replace(/\D/g, "");

  try {
    const clients = await prisma.user.findMany({
      where: {
        role: "CLIENT",
        OR: [
          {
            name: {
              contains: rawQ,
              mode: "insensitive",
            },
          },
          ...(phoneDigits.length >= 3
            ? [
                {
                  phone: {
                    contains: phoneDigits,
                  },
                },
              ]
            : []),
        ],
      },
      orderBy: [{ name: "asc" }],
      take,
      select: {
        id: true,
        name: true,
        phone: true,
      },
    });

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
