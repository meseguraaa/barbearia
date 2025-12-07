// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed...");

  // ================================================================
  // Vars de ambiente (fallbacks somente para DEV)
  // ================================================================
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@barbearia.com";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123";

  const saltRounds = 10;
  const adminPasswordHash = await bcrypt.hash(adminPassword, saltRounds);

  // Senha padrão para os barbeiros seedados
  const defaultBarberPassword = "12345";
  const barberPasswordHash = await bcrypt.hash(
    defaultBarberPassword,
    saltRounds,
  );

  // ================================================================
  // ADMIN
  // ================================================================
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: "Administrador",
      role: "ADMIN",
      passwordHash: adminPasswordHash,
    },
    create: {
      name: "Administrador",
      email: adminEmail,
      role: "ADMIN",
      passwordHash: adminPasswordHash,
    },
  });

  console.log("✅ Admin criado/atualizado:", adminUser.email);

  // ================================================================
  // PROFISSIONAIS (BARBERS) + USERS
  // ================================================================
  const barbersSeed = [
    {
      name: "Jeferson Cellani",
      email: "jeff@aaa.com",
      phone: "11985970667",
    },
    {
      name: "Matheus Lima",
      email: "matt@aaa.com",
      phone: "11985970667",
    },
    {
      name: "Rafael Vieira",
      email: "rafa@aaa.com",
      phone: "11985970667",
    },
    {
      name: "Thiago Silva",
      email: "thi@aaa.com",
      phone: "11985970667",
    },
  ];

  const barbers: { id: string; name: string; email: string }[] = [];

  for (const barberData of barbersSeed) {
    // 1) User com role BARBER
    const user = await prisma.user.upsert({
      where: { email: barberData.email },
      update: {
        name: barberData.name,
        phone: barberData.phone,
        role: "BARBER",
        passwordHash: barberPasswordHash,
      },
      create: {
        name: barberData.name,
        email: barberData.email,
        phone: barberData.phone,
        role: "BARBER",
        passwordHash: barberPasswordHash,
      },
    });

    // 2) Barber vinculado ao User
    const barber = await prisma.barber.upsert({
      where: { email: barberData.email },
      update: {
        name: barberData.name,
        phone: barberData.phone,
        isActive: true,
        userId: user.id,
      },
      create: {
        name: barberData.name,
        email: barberData.email,
        phone: barberData.phone,
        isActive: true,
        userId: user.id,
      },
    });

    barbers.push({
      id: barber.id,
      name: barber.name,
      email: barber.email,
    });
  }

  console.log(
    "💈 Barbeiros criados/atualizados:",
    barbers.map((b) => b.email),
  );

  // ================================================================
  // SERVIÇOS
  // ================================================================
  const servicesSeed = [
    {
      id: "service-cabelo",
      name: "Cabelo (máquina ou tesoura)",
      price: 70, // R$
      durationMinutes: 30,
      barberPercentage: 60, // %
      cancelLimitHours: 1,
      cancelFeePercentage: 10, // %
    },
    {
      id: "service-cabelo-barba",
      name: "Cabelo e Barba",
      price: 120,
      durationMinutes: 60,
      barberPercentage: 60,
      cancelLimitHours: 1,
      cancelFeePercentage: 10,
    },
    {
      id: "service-barba-tradicional",
      name: "Barba tradicional",
      price: 65,
      durationMinutes: 30,
      barberPercentage: 60,
      cancelLimitHours: 1,
      cancelFeePercentage: 10,
    },
    {
      id: "service-depilacao-nariz-orelha",
      name: "Depilação de nariz e orelha",
      price: 25,
      durationMinutes: 30,
      barberPercentage: 60,
      cancelLimitHours: 1,
      cancelFeePercentage: 10,
    },
    {
      id: "service-raspagem-barba",
      name: "Raspagem e Barba",
      price: 100,
      durationMinutes: 60,
      barberPercentage: 60,
      cancelLimitHours: 1,
      cancelFeePercentage: 10,
    },
  ];

  const services: { id: string; name: string }[] = [];

  for (const s of servicesSeed) {
    const service = await prisma.service.upsert({
      where: { id: s.id },
      update: {
        name: s.name,
        price: s.price,
        durationMinutes: s.durationMinutes,
        barberPercentage: s.barberPercentage,
        cancelLimitHours: s.cancelLimitHours,
        cancelFeePercentage: s.cancelFeePercentage,
        isActive: true,
      },
      create: {
        id: s.id,
        name: s.name,
        price: s.price,
        durationMinutes: s.durationMinutes,
        barberPercentage: s.barberPercentage,
        cancelLimitHours: s.cancelLimitHours,
        cancelFeePercentage: s.cancelFeePercentage,
        isActive: true,
      },
    });

    services.push({ id: service.id, name: service.name });
  }

  console.log(
    "✂️ Serviços criados/atualizados:",
    services.map((s) => s.name),
  );

  // ================================================================
  // RELAÇÃO SERVIÇO x BARBEIRO (ServiceProfessional)
  // (todos os barbeiros fazem todos os serviços)
  // ================================================================
  if (barbers.length && services.length) {
    await prisma.serviceProfessional.createMany({
      data: barbers.flatMap((barber) =>
        services.map((service) => ({
          serviceId: service.id,
          barberId: barber.id,
        })),
      ),
      skipDuplicates: true,
    });

    console.log("🔗 Relações serviço x barbeiro criadas/atualizadas.");
  }

  console.log("🌱 Seed finalizado com sucesso.");
}

// ================================================================
// Execução
// ================================================================
main()
  .catch((e) => {
    console.error("❌ Erro ao rodar seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
