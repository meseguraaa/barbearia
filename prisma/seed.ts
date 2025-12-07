// prisma/seed.ts
import { PrismaClient } from "../src/generated/prisma";
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

  // ================================================================
  // Criar/Atualizar ADMIN (único usuário seedado)
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
