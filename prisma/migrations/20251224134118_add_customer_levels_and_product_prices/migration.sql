-- CreateEnum
CREATE TYPE "CustomerLevel" AS ENUM ('BRONZE', 'PRATA', 'OURO', 'DIAMANTE');

-- CreateEnum
CREATE TYPE "CustomerLevelRuleType" AS ENUM ('HAS_ACTIVE_PLAN');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "birthdayBenefitEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "birthdayPriceLevel" "CustomerLevel";

-- CreateTable
CREATE TABLE "customer_level_configs" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "level" "CustomerLevel" NOT NULL,
    "minAppointmentsDone" INTEGER NOT NULL DEFAULT 0,
    "minOrdersCompleted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_level_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_level_rules" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "type" "CustomerLevelRuleType" NOT NULL,
    "targetLevel" "CustomerLevel" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_level_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_level_states" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "levelCurrent" "CustomerLevel" NOT NULL DEFAULT 'BRONZE',
    "levelEarnedLastPeriod" "CustomerLevel" NOT NULL DEFAULT 'BRONZE',
    "levelEffectiveFrom" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_level_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_level_periods" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "appointmentsDone" INTEGER NOT NULL DEFAULT 0,
    "ordersCompleted" INTEGER NOT NULL DEFAULT 0,
    "earnedLevel" "CustomerLevel" NOT NULL DEFAULT 'BRONZE',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_level_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_prices_by_level" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "level" "CustomerLevel" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_prices_by_level_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_level_configs_unitId_idx" ON "customer_level_configs"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_level_configs_unitId_level_key" ON "customer_level_configs"("unitId", "level");

-- CreateIndex
CREATE INDEX "customer_level_rules_unitId_isEnabled_idx" ON "customer_level_rules"("unitId", "isEnabled");

-- CreateIndex
CREATE INDEX "customer_level_states_userId_idx" ON "customer_level_states"("userId");

-- CreateIndex
CREATE INDEX "customer_level_states_unitId_idx" ON "customer_level_states"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_level_states_unitId_userId_key" ON "customer_level_states"("unitId", "userId");

-- CreateIndex
CREATE INDEX "customer_level_periods_unitId_periodKey_idx" ON "customer_level_periods"("unitId", "periodKey");

-- CreateIndex
CREATE INDEX "customer_level_periods_userId_periodKey_idx" ON "customer_level_periods"("userId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "customer_level_periods_unitId_userId_periodKey_key" ON "customer_level_periods"("unitId", "userId", "periodKey");

-- CreateIndex
CREATE INDEX "product_prices_by_level_level_idx" ON "product_prices_by_level"("level");

-- CreateIndex
CREATE UNIQUE INDEX "product_prices_by_level_productId_level_key" ON "product_prices_by_level"("productId", "level");

-- AddForeignKey
ALTER TABLE "customer_level_configs" ADD CONSTRAINT "customer_level_configs_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_level_rules" ADD CONSTRAINT "customer_level_rules_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_level_states" ADD CONSTRAINT "customer_level_states_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_level_states" ADD CONSTRAINT "customer_level_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_level_periods" ADD CONSTRAINT "customer_level_periods_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_level_periods" ADD CONSTRAINT "customer_level_periods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices_by_level" ADD CONSTRAINT "product_prices_by_level_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
