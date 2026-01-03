// prisma/backfill-company-members.ts
import { PrismaClient, CompanyMemberRole } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Backfill de CompanyMember para CLIENTs antigos.
 *
 * O sistema agora é multi-tenant: User NÃO tem companyId.
 * O vínculo real é CompanyMember(companyId, userId).
 *
 * Este script:
 * - descobre (companyId, userId) a partir de tabelas que já possuem companyId
 * - cria memberships faltantes em company_members
 * - marca como role=CLIENT e isActive=true
 *
 * Seguro para rodar várias vezes (usa upsert/skip duplicates via upsert por chave composta).
 */

type Pair = { companyId: string; userId: string };

async function collectPairs(): Promise<Pair[]> {
  const pairs = new Map<string, Pair>();

  const add = (
    companyId: string | null | undefined,
    userId: string | null | undefined,
  ) => {
    const c = String(companyId ?? "").trim();
    const u = String(userId ?? "").trim();
    if (!c || !u) return;
    const key = `${c}::${u}`;
    if (!pairs.has(key)) pairs.set(key, { companyId: c, userId: u });
  };

  // 1) Appointments -> clientId
  const apts = await prisma.appointment.findMany({
    select: { companyId: true, clientId: true },
  });
  for (const a of apts) add(a.companyId, a.clientId);

  // 2) Orders -> clientId (nullable)
  const orders = await prisma.order.findMany({
    select: { companyId: true, clientId: true },
    where: { clientId: { not: null } },
  });
  for (const o of orders) add(o.companyId, o.clientId ?? undefined);

  // 3) ClientPlans -> clientId
  const plans = await prisma.clientPlan.findMany({
    select: { companyId: true, clientId: true },
  });
  for (const p of plans) add(p.companyId, p.clientId);

  // 4) Reviews -> clientId
  const reviews = await prisma.appointmentReview.findMany({
    select: { companyId: true, clientId: true },
  });
  for (const r of reviews) add(r.companyId, r.clientId);

  // 5) CustomerLevelState -> userId (CLIENT)
  const levels = await prisma.customerLevelState.findMany({
    select: { companyId: true, userId: true },
  });
  for (const s of levels) add(s.companyId, s.userId);

  return Array.from(pairs.values());
}

async function main() {
  console.log("🧩 Backfill CompanyMember (CLIENT) iniciando...");

  // coleta pares únicos
  const pairs = await collectPairs();
  console.log(`🔎 Pares companyId/userId encontrados: ${pairs.length}`);

  if (pairs.length === 0) {
    console.log("✅ Nada para fazer. Encerrando.");
    return;
  }

  // cria memberships faltantes
  // - usamos transação em lotes pra evitar estourar payload/timeout
  const BATCH = 500;
  let createdOrUpdated = 0;

  for (let i = 0; i < pairs.length; i += BATCH) {
    const batch = pairs.slice(i, i + BATCH);

    await prisma.$transaction(async (tx) => {
      for (const { companyId, userId } of batch) {
        await tx.companyMember.upsert({
          where: {
            companyId_userId: { companyId, userId },
          },
          update: {
            // Se já existe, só garante ativo e role CLIENT
            // (não mexe em lastUnitId pra não bagunçar UX)
            isActive: true,
            role: CompanyMemberRole.CLIENT,
          },
          create: {
            companyId,
            userId,
            isActive: true,
            role: CompanyMemberRole.CLIENT,
          },
          select: { id: true },
        });

        // opcional: garantir que o User.role seja CLIENT (compatibilidade)
        // (não rebaixa ADMIN/OWNER por acidente)
        // Se quiser habilitar, descomenta:
        // await tx.user.updateMany({
        //   where: { id: userId, role: "CLIENT" },
        //   data: { role: "CLIENT" },
        // });

        createdOrUpdated += 1;
      }
    });

    console.log(
      `✅ Lote ${Math.floor(i / BATCH) + 1} aplicado (${Math.min(
        i + BATCH,
        pairs.length,
      )}/${pairs.length})`,
    );
  }

  console.log(`🎉 Backfill finalizado. Processados: ${createdOrUpdated}`);
}

main()
  .catch((e) => {
    console.error("❌ Erro no backfill:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
