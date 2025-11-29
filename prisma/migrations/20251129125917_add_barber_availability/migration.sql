-- CreateEnum
CREATE TYPE "BarberDailyAvailabilityType" AS ENUM ('DAY_OFF', 'CUSTOM');

-- CreateTable
CREATE TABLE "barber_weekly_availabilities" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "barber_weekly_availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barber_weekly_time_intervals" (
    "id" TEXT NOT NULL,
    "weeklyAvailabilityId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "barber_weekly_time_intervals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barber_daily_availabilities" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "BarberDailyAvailabilityType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "barber_daily_availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barber_daily_time_intervals" (
    "id" TEXT NOT NULL,
    "dailyAvailabilityId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "barber_daily_time_intervals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "barber_weekly_availabilities_barberId_weekday_key" ON "barber_weekly_availabilities"("barberId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "barber_daily_availabilities_barberId_date_key" ON "barber_daily_availabilities"("barberId", "date");

-- AddForeignKey
ALTER TABLE "barber_weekly_availabilities" ADD CONSTRAINT "barber_weekly_availabilities_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "barbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_weekly_time_intervals" ADD CONSTRAINT "barber_weekly_time_intervals_weeklyAvailabilityId_fkey" FOREIGN KEY ("weeklyAvailabilityId") REFERENCES "barber_weekly_availabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_daily_availabilities" ADD CONSTRAINT "barber_daily_availabilities_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "barbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_daily_time_intervals" ADD CONSTRAINT "barber_daily_time_intervals_dailyAvailabilityId_fkey" FOREIGN KEY ("dailyAvailabilityId") REFERENCES "barber_daily_availabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
