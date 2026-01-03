// prisma/seed.ts
import {
  PrismaClient,
  CompanySegment,
  CompanyMemberRole,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seed (Company + Unit + OWNER) iniciando...");

  // ✅ Preferencial: deixar fixo aqui como você pediu
  const adminEmail = "adminmaster@agendaplay.com.br";
  const adminPassword = "Mesegura@2468*";

  // ✅ Company/Unit padrão inicial
  const companyName = "AgendaPlay Demo (Barbearia)";
  const companySegment: CompanySegment = "BARBERSHOP";
  const unitName = "Matriz";

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await prisma.$transaction(async (tx) => {
    // 1) Cria/atualiza o usuário admin master (identidade global)
    const adminUser = await tx.user.upsert({
      where: { email: adminEmail },
      update: {
        name: "Admin Master",
        role: "ADMIN",
        // ⚠️ Mantido por compatibilidade com seu código atual.
        // No multi-tenant, "dono" real é CompanyMember.role = OWNER.
        isOwner: true,
        isActive: true,
        passwordHash,
        phone: null,
      },
      create: {
        name: "Admin Master",
        email: adminEmail,
        role: "ADMIN",
        isOwner: true,
        isActive: true,
        passwordHash,
        phone: null,
      },
    });

    console.log("✅ Admin Master pronto:", adminUser.email);

    // 2) Criar (ou reutilizar) a Company padrão
    //    (como você resetou o banco, isso é o cenário comum)
    //    Estratégia: procurar por (name + segment).
    let company = await tx.company.findFirst({
      where: { name: companyName, segment: companySegment },
      select: { id: true, name: true, segment: true },
    });

    if (!company) {
      company = await tx.company.create({
        data: {
          name: companyName,
          segment: companySegment,
          isActive: true,
        },
        select: { id: true, name: true, segment: true },
      });

      console.log("🏢 Company criada:", company.name, `(${company.segment})`);
    } else {
      console.log(
        "🏢 Company reutilizada:",
        company.name,
        `(${company.segment})`,
      );
    }

    // 3) Criar (ou reutilizar) a primeira Unit da company
    let unit = await tx.unit.findFirst({
      where: { companyId: company.id, name: unitName },
      select: { id: true, name: true },
    });

    if (!unit) {
      unit = await tx.unit.create({
        data: {
          companyId: company.id,
          name: unitName,
          phone: null,
          address: null,
          isActive: true,
        },
        select: { id: true, name: true },
      });

      console.log("🏬 Unit criada:", unit.name);
    } else {
      console.log("🏬 Unit reutilizada:", unit.name);
    }

    // 4) Criar/atualizar membership OWNER (User <-> Company)
    const member = await tx.companyMember.upsert({
      where: {
        companyId_userId: {
          companyId: company.id,
          userId: adminUser.id,
        },
      },
      update: {
        role: "OWNER",
        isActive: true,
        lastUnitId: unit.id,
      },
      create: {
        companyId: company.id,
        userId: adminUser.id,
        role: "OWNER",
        isActive: true,
        lastUnitId: unit.id,
      },
      select: { id: true, role: true },
    });

    console.log("👤 Membership criado/ok:", member.role);

    // 5) AdminAccess com permissões totais (escopado por company)
    await tx.adminAccess.upsert({
      where: {
        companyId_userId: {
          companyId: company.id,
          userId: adminUser.id,
        },
      },
      update: {
        unitId: unit.id, // opcional: já amarra a unidade padrão
        canAccessDashboard: true,
        canAccessCheckout: true,
        canAccessAppointments: true,
        canAccessProfessionals: true,
        canAccessServices: true,
        canAccessReviews: true,
        canAccessProducts: true,
        canAccessClients: true,
        canAccessClientLevels: true,
        canAccessFinance: true,
      },
      create: {
        companyId: company.id,
        userId: adminUser.id,
        unitId: unit.id,
        canAccessDashboard: true,
        canAccessCheckout: true,
        canAccessAppointments: true,
        canAccessProfessionals: true,
        canAccessServices: true,
        canAccessReviews: true,
        canAccessProducts: true,
        canAccessClients: true,
        canAccessClientLevels: true,
        canAccessFinance: true,
      },
    });

    console.log("🔐 Permissões completas atribuídas ao OWNER na company.");
  });

  console.log("🌱 Seed finalizado com sucesso (Company + Unit + OWNER).");
}

main()
  .catch((e) => {
    console.error("❌ Erro ao rodar seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
