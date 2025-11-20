// prisma/seed.ts
import { PrismaClient } from "../src/generated/prisma";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed...");

  // ====== Lê config do .env (com fallback só pra DEV) ======
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@barbearia.com";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123";

  const barberEmail = process.env.BARBER_EMAIL ?? "barbeiro@barbearia.com";
  const barberPassword = process.env.BARBER_PASSWORD ?? "barber123";

  // IMPORTANTE: em produção, use sempre variáveis de ambiente
  // e senhas fortes; esses fallbacks são só pra ambiente local.

  // ====== Gera hashes de senha com bcrypt ======
  const saltRounds = 10;

  const adminPasswordHash = await bcrypt.hash(adminPassword, saltRounds);
  const barberPasswordHash = await bcrypt.hash(barberPassword, saltRounds);

  // ====== Cria/atualiza ADMIN ======
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

  // ====== Cria/atualiza BARBER ======
  const barberUser = await prisma.user.upsert({
    where: { email: barberEmail },
    update: {
      name: "Barbeiro Principal",
      role: "BARBER",
      passwordHash: barberPasswordHash,
    },
    create: {
      name: "Barbeiro Principal",
      email: barberEmail,
      role: "BARBER",
      passwordHash: barberPasswordHash,
    },
  });

  console.log("✅ Barbeiro criado/atualizado:", barberUser.email);

  console.log("🌱 Seed finalizado com sucesso.");
}

main()
  .catch((e) => {
    console.error("❌ Erro ao rodar seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
