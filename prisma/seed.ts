// prisma/seed.ts
import { PrismaClient } from "../src/generated/prisma";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed...");

  // ================================================================
  // Vars de ambiente (com fallbacks somente para ambiente DEV)
  // ================================================================
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@barbearia.com";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123";

  const saltRounds = 10;

  // Hash do admin
  const adminPasswordHash = await bcrypt.hash(adminPassword, saltRounds);

  // ================================================================
  // Criar/Atualizar ADMIN
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
  // Lista de barbeiros fixos (podemos crescer isso quando quiser)
  // ================================================================
  const barbers = [
    {
      name: "Barbeiro Principal",
      email: "barbeiro@barbearia.com",
      password: "barber123",
    },
    {
      name: "João Cortes",
      email: "joao@barbearia.com",
      password: "123456",
    },
    {
      name: "Marcelo Fade",
      email: "marcelo@barbearia.com",
      password: "123456",
    },
    {
      name: "Bruno Leal",
      email: "bruno@barbearia.com",
      password: "123456",
    },
  ];

  // ================================================================
  // Criar/Atualizar BARBEIROS
  // ================================================================
  for (const barber of barbers) {
    const passwordHash = await bcrypt.hash(barber.password, saltRounds);

    const user = await prisma.user.upsert({
      where: { email: barber.email },
      update: {
        name: barber.name,
        role: "BARBER",
        passwordHash,
      },
      create: {
        name: barber.name,
        email: barber.email,
        role: "BARBER",
        passwordHash,
      },
    });

    console.log(`✂️  Barbeiro criado/atualizado: ${user.email}`);
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
