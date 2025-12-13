// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ================================================================
// TIPOS AUXILIARES
// ================================================================
type SeedBarber = {
  id: string;
  name: string;
  email: string;
};

type SeedClient = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

type SeedService = {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  barberPercentage: number;
  cancelLimitHours: number | null;
  cancelFeePercentage: number | null;
};

type SeedProduct = {
  id: string;
  name: string;
  price: number;
  barberPercentage: number;
};

// ================================================================
// HELPERS
// ================================================================
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sample<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function chance(probability: number): boolean {
  return Math.random() < probability;
}

// Data aleatória nos últimos N dias
function randomDateInLastNDays(daysBack: number): Date {
  const now = new Date();
  const offset = randomInt(0, daysBack);
  const d = new Date(now);
  d.setDate(now.getDate() - offset);

  // horário comercial aleatório: 10h às 20h
  const hour = randomInt(10, 20);
  const minute = [0, 15, 30, 45][randomInt(0, 3)];
  d.setHours(hour, minute, 0, 0);

  return d;
}

// ================================================================
// SEED DE TAGS DE AVALIAÇÃO
// ================================================================
async function seedReviewTags() {
  const tags = [
    // positivas
    { label: "Atendimento rápido", isNegative: false },
    { label: "Simpatia do profissional", isNegative: false },
    { label: "Ambiente agradável", isNegative: false },
    { label: "Corte impecável", isNegative: false },
    { label: "Pontualidade", isNegative: false },
    { label: "Custo-benefício", isNegative: false },

    // negativas
    { label: "Atraso no atendimento", isNegative: true },
    { label: "Profissional antipático", isNegative: true },
    { label: "Ambiente barulhento", isNegative: true },
    { label: "Resultado diferente do pedido", isNegative: true },
    { label: "Preço acima do esperado", isNegative: true },
  ];

  const created = [];

  for (const tag of tags) {
    const t = await prisma.reviewTag.upsert({
      where: { label: tag.label },
      update: {
        isNegative: tag.isNegative,
        isActive: true,
      },
      create: {
        label: tag.label,
        isNegative: tag.isNegative,
        isActive: true,
      },
    });

    created.push(t);
  }

  console.log("🏷️  ReviewTags criadas/atualizadas:", created.length);
  return created;
}

// ================================================================
// SEED DE CLIENTES
// ================================================================
async function seedClients(): Promise<SeedClient[]> {
  const names = [
    "Ana Souza",
    "Bruno Lima",
    "Carla Ferreira",
    "Diego Santos",
    "Eduardo Alves",
    "Fernanda Rocha",
    "Gabriel Costa",
    "Helena Martins",
    "Igor Pereira",
    "Julia Nunes",
    "Kleber Moreira",
    "Laura Dias",
    "Marcos Vinicius",
    "Natália Araújo",
    "Otávio Teixeira",
    "Paula Ribeiro",
    "Rafael Silva",
    "Sabrina Gomes",
    "Thiago Oliveira",
    "Vanessa Cardoso",
    "Wesley Melo",
    "Yasmin Barros",
    "Zeca Moura",
  ];

  const clients: SeedClient[] = [];

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const slug = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z\s]/g, "")
      .replace(/\s+/g, ".");
    const email = `${slug}@cliente.com`;
    const phone = `1198${randomInt(1000000, 9999999)}`;

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name,
        phone,
        role: "CLIENT",
        isActive: true,
      },
      create: {
        name,
        email,
        phone,
        role: "CLIENT",
        isActive: true,
      },
    });

    clients.push({
      id: user.id,
      name: user.name ?? name,
      email: user.email,
      phone: user.phone ?? phone,
    });
  }

  console.log("🧑‍🦱 Clientes criados/atualizados:", clients.length);
  return clients;
}

// ================================================================
// SEED DE PRODUTOS
// ================================================================
async function seedProducts(): Promise<SeedProduct[]> {
  const productsSeed: SeedProduct[] = [
    {
      id: "prod-pomada-modeladora",
      name: "Pomada Modeladora",
      price: 45,
      barberPercentage: 20,
    },
    {
      id: "prod-shampoo-barba",
      name: "Shampoo para Barba",
      price: 55,
      barberPercentage: 20,
    },
    {
      id: "prod-oleo-barba",
      name: "Óleo para Barba",
      price: 65,
      barberPercentage: 25,
    },
    {
      id: "prod-gel-cabelo",
      name: "Gel para Cabelo",
      price: 35,
      barberPercentage: 20,
    },
  ];

  for (const p of productsSeed) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {
        name: p.name,
        description: p.name,
        imageUrl: "/placeholder-product.png",
        price: p.price,
        barberPercentage: p.barberPercentage,
        category: "Produtos de cuidado",
        isActive: true,
        stockQuantity: 100,
      },
      create: {
        id: p.id,
        name: p.name,
        description: p.name,
        imageUrl: "/placeholder-product.png",
        price: p.price,
        barberPercentage: p.barberPercentage,
        category: "Produtos de cuidado",
        isActive: true,
        stockQuantity: 100,
      },
    });
  }

  console.log("🧴 Produtos criados/atualizados:", productsSeed.length);
  return productsSeed;
}

// ================================================================
// SEED DE VENDAS DE PRODUTO (ProductSale)
// ================================================================
async function seedProductSales(
  barbers: SeedBarber[],
  products: SeedProduct[],
) {
  const totalSales = 350; // +75% vendas para inflar faturamento

  for (let i = 0; i < totalSales; i++) {
    const barber = sample(barbers);
    const product = sample(products);
    const quantity = randomInt(1, 3);
    const unitPrice = product.price;
    const totalPrice = unitPrice * quantity;
    const soldAt = randomDateInLastNDays(180); // últimos ~6 meses

    await prisma.productSale.create({
      data: {
        barberId: barber.id,
        productId: product.id,
        quantity,
        unitPrice,
        totalPrice,
        soldAt,
      },
    });
  }

  console.log("🧾 ProductSales criadas:", totalSales);
}

// ================================================================
// SEED DE DESPESAS (EXPENSES)
// ================================================================
async function seedExpenses() {
  const now = new Date();
  const monthsBack = 5; // mês atual + últimos 5

  // valores base fixos para recorrentes (iguais em todos os meses)
  const rentAmount = 3500; // aluguel
  const utilitiesAmount = 700; // contas de consumo
  const taxesAmount = 900; // impostos

  // insumos não são recorrentes, podem variar mês a mês
  const suppliesBaseAmount = 400;

  for (let i = 0; i <= monthsBack; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);

    await prisma.expense.createMany({
      data: [
        {
          description: `Aluguel salão - ${date.getMonth() + 1}/${date.getFullYear()}`,
          category: "RENT",
          amount: rentAmount, // mesmo valor sempre
          dueDate: new Date(date.getFullYear(), date.getMonth(), 5),
          isRecurring: true,
          isPaid: true,
        },
        {
          description: `Contas de consumo - ${date.getMonth() + 1}/${date.getFullYear()}`,
          category: "UTILITIES",
          amount: utilitiesAmount, // mesmo valor sempre
          dueDate: new Date(date.getFullYear(), date.getMonth(), 10),
          isRecurring: true,
          isPaid: true,
        },
        {
          description: `Impostos - ${date.getMonth() + 1}/${date.getFullYear()}`,
          category: "TAXES",
          amount: taxesAmount, // mesmo valor sempre
          dueDate: new Date(date.getFullYear(), date.getMonth(), 20),
          isRecurring: true,
          isPaid: true,
        },
        {
          description: `Insumos - ${date.getMonth() + 1}/${date.getFullYear()}`,
          category: "SUPPLIES",
          amount: suppliesBaseAmount + randomInt(-50, 50), // variação ok
          dueDate: new Date(date.getFullYear(), date.getMonth(), 15),
          isRecurring: false, // 👈 NÃO recorrente
          isPaid: true,
        },
      ],
    });
  }

  console.log("📉 Despesas criadas (recorrentes fixas e variáveis realistas).");
}

// ================================================================
// SEED DE ATENDIMENTOS + AVALIAÇÕES
// ================================================================
async function seedAppointmentsAndReviews(
  barbers: SeedBarber[],
  clients: SeedClient[],
  servicesSeed: SeedService[],
  reviewTags: { id: string; label: string; isNegative: boolean }[],
) {
  const totalAppointments = 600; // ajusta se quiser
  const positiveTags = reviewTags.filter((t) => !t.isNegative);
  const negativeTags = reviewTags.filter((t) => t.isNegative);

  for (let i = 0; i < totalAppointments; i++) {
    const barber = sample(barbers);
    const client = sample(clients);
    // serviços mais caros aparecem mais
    const weightedServices = [
      ...servicesSeed, // todos
      servicesSeed.find((s) => s.price === 120)!, // dobra chance do de 120
      servicesSeed.find((s) => s.price === 100)!, // dobra chance do de 100
    ];

    const serviceSeed = sample(weightedServices);

    const scheduleAt = randomDateInLastNDays(180);

    // 🔥 MODO PITCH: todo atendimento é concluído com sucesso
    const status = "DONE" as const;

    const priceNumber = serviceSeed.price;
    const percentNumber = serviceSeed.barberPercentage;
    const earningNumber = (priceNumber * percentNumber) / 100;

    const cancelFeeApplied = false;
    const cancelFeeValue = null;

    const appointment = await prisma.appointment.create({
      data: {
        description: `${serviceSeed.name} - ${client.name}`,
        clientName: client.name,
        phone: client.phone,
        scheduleAt,
        status,
        clientId: client.id,
        barberId: barber.id,
        serviceId: serviceSeed.id,
        servicePriceAtTheTime: priceNumber,
        barberPercentageAtTheTime: percentNumber,
        barberEarningValue: status === "DONE" ? earningNumber : null,
        cancelFeeApplied: !!cancelFeeApplied,
        cancelFeeValue,
        cancelledByRole: null,
        concludedByRole: "BARBER",
      },
    });

    // Avaliação: só para atendimentos concluídos, probabilidade ~60%
    if (status === "DONE" && chance(0.6)) {
      const rRating = Math.random();
      let rating: 1 | 2 | 3 | 4 | 5;
      // 80% positivas
      if (rRating < 0.02) rating = 1;
      else if (rRating < 0.05) rating = 2;
      else if (rRating < 0.2) rating = 3;
      else if (rRating < 0.55) rating = 4;
      else rating = 5;

      const isPositive = rating >= 4;
      const isNegative = rating <= 2;

      const review = await prisma.appointmentReview.create({
        data: {
          appointmentId: appointment.id,
          clientId: client.id,
          barberId: barber.id,
          rating,
          comment:
            chance(0.5) && isPositive
              ? "Atendimento excelente, vou voltar!"
              : chance(0.4) && isNegative
                ? "Experiência abaixo do esperado."
                : null,
          isAnonymousForProfessional: chance(0.2),
        },
      });

      // Tags da avaliação
      const tagsToUse = isPositive
        ? positiveTags
        : isNegative
          ? negativeTags
          : [];

      if (tagsToUse.length > 0) {
        const howMany = randomInt(1, Math.min(3, tagsToUse.length));
        const shuffled = [...tagsToUse].sort(() => Math.random() - 0.5);
        const chosen = shuffled.slice(0, howMany);

        for (const t of chosen) {
          await prisma.appointmentReviewTag.create({
            data: {
              reviewId: review.id,
              tagId: t.id,
            },
          });
        }
      }
    }
  }

  console.log("✂️ Atendimentos + avaliações gerados:", totalAppointments);
}

// ================================================================
// SEED PRINCIPAL
// ================================================================
async function main() {
  console.log("🌱 Iniciando seed...");

  // 🧨 HARD RESET: apaga tudo na ordem certa por causa de FK
  console.log("🧨 Limpando banco (deleteMany em todas as tabelas)...");

  // Tabelas que dependem de outras (filhos primeiro)
  await prisma.appointmentReviewTag.deleteMany();
  await prisma.appointmentReview.deleteMany();

  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();

  await prisma.productSale.deleteMany();

  await prisma.appointment.deleteMany();

  await prisma.barberWeeklyTimeInterval.deleteMany();
  await prisma.barberWeeklyAvailability.deleteMany();
  await prisma.barberDailyTimeInterval.deleteMany();
  await prisma.barberDailyAvailability.deleteMany();

  await prisma.clientPlan.deleteMany();
  await prisma.planService.deleteMany();
  await prisma.plan.deleteMany();

  await prisma.serviceProfessional.deleteMany();

  await prisma.expense.deleteMany();
  await prisma.product.deleteMany();

  await prisma.adminAccess.deleteMany();
  await prisma.reviewTag.deleteMany();

  await prisma.account.deleteMany();
  await prisma.session.deleteMany();
  await prisma.verificationToken.deleteMany();

  await prisma.barber.deleteMany();
  await prisma.service.deleteMany();
  await prisma.user.deleteMany();

  console.log("✅ Banco limpo. Recriando dados de demo...");

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
  // ADMIN (DONO)
  // ================================================================
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: "Administrador",
      role: "ADMIN",
      passwordHash: adminPasswordHash,
      isOwner: true, // 🔹 marca como DONO
    },
    create: {
      name: "Administrador",
      email: adminEmail,
      role: "ADMIN",
      passwordHash: adminPasswordHash,
      isOwner: true, // 🔹 marca como DONO
    },
  });

  console.log("✅ Admin criado/atualizado:", adminUser.email);

  // 🔹 Permissões completas para o DONO no AdminAccess
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

  console.log("🔐 Permissões completas atribuídas ao admin/dono.");

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

  const barbers: SeedBarber[] = [];

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
  const servicesSeed: SeedService[] = [
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

  for (const s of servicesSeed) {
    await prisma.service.upsert({
      where: { id: s.id },
      update: {
        name: s.name,
        price: s.price,
        durationMinutes: s.durationMinutes,
        barberPercentage: s.barberPercentage,
        cancelLimitHours: s.cancelLimitHours ?? null,
        cancelFeePercentage: s.cancelFeePercentage ?? null,
        isActive: true,
      },
      create: {
        id: s.id,
        name: s.name,
        price: s.price,
        durationMinutes: s.durationMinutes,
        barberPercentage: s.barberPercentage,
        cancelLimitHours: s.cancelLimitHours ?? null,
        cancelFeePercentage: s.cancelFeePercentage ?? null,
        isActive: true,
      },
    });
  }

  console.log(
    "✂️ Serviços criados/atualizados:",
    servicesSeed.map((s) => s.name),
  );

  // ================================================================
  // RELAÇÃO SERVIÇO x BARBEIRO (ServiceProfessional)
  // (todos os barbeiros fazem todos os serviços)
  // ================================================================
  if (barbers.length && servicesSeed.length) {
    await prisma.serviceProfessional.createMany({
      data: barbers.flatMap((barber) =>
        servicesSeed.map((service) => ({
          serviceId: service.id,
          barberId: barber.id,
        })),
      ),
      skipDuplicates: true,
    });

    console.log("🔗 Relações serviço x barbeiro criadas/atualizadas.");
  }

  // ================================================================
  // MASSA DE DADOS PARA DASHBOARD (CLIENTES, PRODUTOS, VENDAS, ETC)
  // ================================================================
  const reviewTags = await seedReviewTags();
  const clients = await seedClients();
  const products = await seedProducts();
  await seedProductSales(barbers, products);
  await seedExpenses();
  await seedAppointmentsAndReviews(barbers, clients, servicesSeed, reviewTags);

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
