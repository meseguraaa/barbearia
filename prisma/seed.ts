// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seed (somente admin dono) iniciando...");

  // Preferencial: deixar fixo aqui como você pediu
  const adminEmail = "adminmaster@agendaplay.com.br";
  const adminPassword = "Mesegura@2468*";

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  // 1) (Opcional) garantir que só exista 1 dono
  // Se você quiser manter outros ADMINs, mas sem isOwner, isso aqui é perfeito.
  await prisma.user.updateMany({
    where: {
      role: "ADMIN",
      isOwner: true,
      email: { not: adminEmail },
    },
    data: { isOwner: false },
  });

  // 2) Cria/atualiza o admin dono
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: "Admin Master",
      role: "ADMIN",
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

  console.log("✅ Admin dono pronto:", adminUser.email);

  // 3) Permissões completas (AdminAccess)
  await prisma.adminAccess.upsert({
    where: { userId: adminUser.id },
    update: {
      canAccessDashboard: true,
      canAccessCheckout: true,
      canAccessAppointments: true,
      canAccessProfessionals: true,
      canAccessServices: true,
      canAccessReviews: true,
      canAccessProducts: true,
      canAccessClients: true,
      canAccessFinance: true,
    },
    create: {
      userId: adminUser.id,
      canAccessDashboard: true,
      canAccessCheckout: true,
      canAccessAppointments: true,
      canAccessProfessionals: true,
      canAccessServices: true,
      canAccessReviews: true,
      canAccessProducts: true,
      canAccessClients: true,
      canAccessFinance: true,
    },
  });

  console.log("🔐 Permissões completas atribuídas ao admin dono.");
  console.log("🌱 Seed finalizado com sucesso (somente admin).");
}

main()
  .catch((e) => {
    console.error("❌ Erro ao rodar seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
