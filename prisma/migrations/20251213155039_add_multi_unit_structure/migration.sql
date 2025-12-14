/*
  Warnings:

  - A unique constraint covering the columns `[barberId,unitId,date]` on the table `barber_daily_availabilities` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[barberId,unitId,weekday]` on the table `barber_weekly_availabilities` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `unitId` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unitId` to the `appointments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unitId` to the `barber_daily_availabilities` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unitId` to the `barber_weekly_availabilities` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unitId` to the `expenses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unitId` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unitId` to the `services` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "barber_daily_availabilities_barberId_date_key";

-- DropIndex
DROP INDEX "barber_weekly_availabilities_barberId_weekday_key";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "unitId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "unitId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "barber_daily_availabilities" ADD COLUMN     "unitId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "barber_weekly_availabilities" ADD COLUMN     "unitId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "unitId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "unitId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "unitId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barber_units" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "barber_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_weekly_availabilities" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_weekly_availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_weekly_time_intervals" (
    "id" TEXT NOT NULL,
    "weeklyAvailabilityId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_weekly_time_intervals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_daily_availabilities" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_daily_availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_daily_time_intervals" (
    "id" TEXT NOT NULL,
    "dailyAvailabilityId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_daily_time_intervals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "barber_units_unitId_idx" ON "barber_units"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "barber_units_barberId_unitId_key" ON "barber_units"("barberId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "unit_weekly_availabilities_unitId_weekday_key" ON "unit_weekly_availabilities"("unitId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "unit_daily_availabilities_unitId_date_key" ON "unit_daily_availabilities"("unitId", "date");

-- CreateIndex
CREATE INDEX "Product_unitId_idx" ON "Product"("unitId");

-- CreateIndex
CREATE INDEX "appointments_unitId_idx" ON "appointments"("unitId");

-- CreateIndex
CREATE INDEX "barber_daily_availabilities_unitId_idx" ON "barber_daily_availabilities"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "barber_daily_availabilities_barberId_unitId_date_key" ON "barber_daily_availabilities"("barberId", "unitId", "date");

-- CreateIndex
CREATE INDEX "barber_weekly_availabilities_unitId_idx" ON "barber_weekly_availabilities"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "barber_weekly_availabilities_barberId_unitId_weekday_key" ON "barber_weekly_availabilities"("barberId", "unitId", "weekday");

-- CreateIndex
CREATE INDEX "expenses_unitId_idx" ON "expenses"("unitId");

-- CreateIndex
CREATE INDEX "orders_unitId_idx" ON "orders"("unitId");

-- CreateIndex
CREATE INDEX "services_unitId_idx" ON "services"("unitId");

-- AddForeignKey
ALTER TABLE "barber_units" ADD CONSTRAINT "barber_units_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "barbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_units" ADD CONSTRAINT "barber_units_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_weekly_availabilities" ADD CONSTRAINT "unit_weekly_availabilities_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_weekly_time_intervals" ADD CONSTRAINT "unit_weekly_time_intervals_weeklyAvailabilityId_fkey" FOREIGN KEY ("weeklyAvailabilityId") REFERENCES "unit_weekly_availabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_daily_availabilities" ADD CONSTRAINT "unit_daily_availabilities_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_daily_time_intervals" ADD CONSTRAINT "unit_daily_time_intervals_dailyAvailabilityId_fkey" FOREIGN KEY ("dailyAvailabilityId") REFERENCES "unit_daily_availabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_weekly_availabilities" ADD CONSTRAINT "barber_weekly_availabilities_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_daily_availabilities" ADD CONSTRAINT "barber_daily_availabilities_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
