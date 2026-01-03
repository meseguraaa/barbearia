-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CLIENT', 'BARBER', 'ADMIN');

-- CreateEnum
CREATE TYPE "CompanySegment" AS ENUM ('BARBERSHOP', 'AESTHETIC');

-- CreateEnum
CREATE TYPE "CompanyMemberRole" AS ENUM ('OWNER', 'ADMIN', 'STAFF', 'CLIENT');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'DONE', 'CANCELED');

-- CreateEnum
CREATE TYPE "BarberDailyAvailabilityType" AS ENUM ('DAY_OFF', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('RENT', 'UTILITIES', 'TAXES', 'SUPPLIES', 'OTHER');

-- CreateEnum
CREATE TYPE "ClientPlanStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PENDING_CHECKIN', 'EXPIRED', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "CustomerLevel" AS ENUM ('BRONZE', 'PRATA', 'OURO', 'DIAMANTE');

-- CreateEnum
CREATE TYPE "CustomerLevelRuleType" AS ENUM ('HAS_ACTIVE_PLAN');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "segment" "CompanySegment" NOT NULL DEFAULT 'BARBERSHOP',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_members" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "CompanyMemberRole" NOT NULL DEFAULT 'CLIENT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUnitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT,
    "birthday" TIMESTAMP(3),
    "role" "Role" NOT NULL DEFAULT 'CLIENT',
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_level_configs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
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
    "companyId" TEXT NOT NULL,
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
    "companyId" TEXT NOT NULL,
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
    "companyId" TEXT NOT NULL,
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
CREATE TABLE "barber_units" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
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
    "companyId" TEXT NOT NULL,
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
    "companyId" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "barbers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "barbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "unitId" TEXT,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "barberPercentage" DECIMAL(5,2) NOT NULL DEFAULT 50.0,
    "cancelLimitHours" INTEGER,
    "cancelFeePercentage" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_professionals" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "totalBookings" INTEGER NOT NULL DEFAULT 4,
    "commissionPercent" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_services" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_plans" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "usedBookings" INTEGER NOT NULL DEFAULT 0,
    "status" "ClientPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "scheduleAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "clientId" TEXT NOT NULL,
    "barberId" TEXT,
    "serviceId" TEXT,
    "servicePriceAtTheTime" DECIMAL(10,2),
    "barberPercentageAtTheTime" DECIMAL(5,2),
    "barberEarningValue" DECIMAL(10,2),
    "cancelFeeApplied" BOOLEAN NOT NULL DEFAULT false,
    "cancelFeeValue" DECIMAL(10,2),
    "cancelledByRole" "Role",
    "concludedByRole" "Role",
    "concludedByUserId" TEXT,
    "concludedByBarberId" TEXT,
    "cancelledByUserId" TEXT,
    "cancelledByBarberId" TEXT,
    "clientPlanId" TEXT,
    "reviewModalShown" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barber_cancellation_fees" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "barber_cancellation_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "barberPercentage" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "pickupDeadlineDays" INTEGER NOT NULL DEFAULT 2,
    "birthdayBenefitEnabled" BOOLEAN NOT NULL DEFAULT false,
    "birthdayPriceLevel" "CustomerLevel",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_prices_by_level" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "level" "CustomerLevel" NOT NULL,
    "discountPct" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_prices_by_level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSale" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "clientId" TEXT,
    "appointmentId" TEXT,
    "barberId" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "reservedUntil" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "inventoryRevertedAt" TIMESTAMP(3),
    "totalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "serviceId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barber_weekly_availabilities" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
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
    "companyId" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "appointment_reviews" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "isAnonymousForProfessional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_tags" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isNegative" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_review_tags" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_review_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_access" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unitId" TEXT,
    "canAccessDashboard" BOOLEAN NOT NULL DEFAULT false,
    "canAccessCheckout" BOOLEAN NOT NULL DEFAULT false,
    "canAccessAppointments" BOOLEAN NOT NULL DEFAULT false,
    "canAccessProfessionals" BOOLEAN NOT NULL DEFAULT false,
    "canAccessServices" BOOLEAN NOT NULL DEFAULT false,
    "canAccessReviews" BOOLEAN NOT NULL DEFAULT false,
    "canAccessProducts" BOOLEAN NOT NULL DEFAULT false,
    "canAccessClients" BOOLEAN NOT NULL DEFAULT false,
    "canAccessClientLevels" BOOLEAN NOT NULL DEFAULT false,
    "canAccessFinance" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "userId" TEXT,
    "unitId" TEXT,
    "name" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "pushId" TEXT,
    "pushType" TEXT,
    "secondsSincePush" INTEGER,
    "payload" JSONB,
    "context" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "companies_segment_idx" ON "companies"("segment");

-- CreateIndex
CREATE INDEX "company_members_userId_idx" ON "company_members"("userId");

-- CreateIndex
CREATE INDEX "company_members_companyId_role_idx" ON "company_members"("companyId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "company_members_companyId_userId_key" ON "company_members"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "units_companyId_idx" ON "units"("companyId");

-- CreateIndex
CREATE INDEX "customer_level_configs_companyId_idx" ON "customer_level_configs"("companyId");

-- CreateIndex
CREATE INDEX "customer_level_configs_unitId_idx" ON "customer_level_configs"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_level_configs_unitId_level_key" ON "customer_level_configs"("unitId", "level");

-- CreateIndex
CREATE INDEX "customer_level_rules_companyId_isEnabled_idx" ON "customer_level_rules"("companyId", "isEnabled");

-- CreateIndex
CREATE INDEX "customer_level_rules_unitId_isEnabled_idx" ON "customer_level_rules"("unitId", "isEnabled");

-- CreateIndex
CREATE INDEX "customer_level_states_companyId_idx" ON "customer_level_states"("companyId");

-- CreateIndex
CREATE INDEX "customer_level_states_userId_idx" ON "customer_level_states"("userId");

-- CreateIndex
CREATE INDEX "customer_level_states_unitId_idx" ON "customer_level_states"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_level_states_unitId_userId_key" ON "customer_level_states"("unitId", "userId");

-- CreateIndex
CREATE INDEX "customer_level_periods_companyId_periodKey_idx" ON "customer_level_periods"("companyId", "periodKey");

-- CreateIndex
CREATE INDEX "customer_level_periods_unitId_periodKey_idx" ON "customer_level_periods"("unitId", "periodKey");

-- CreateIndex
CREATE INDEX "customer_level_periods_userId_periodKey_idx" ON "customer_level_periods"("userId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "customer_level_periods_unitId_userId_periodKey_key" ON "customer_level_periods"("unitId", "userId", "periodKey");

-- CreateIndex
CREATE INDEX "barber_units_companyId_idx" ON "barber_units"("companyId");

-- CreateIndex
CREATE INDEX "barber_units_unitId_idx" ON "barber_units"("unitId");

-- CreateIndex
CREATE INDEX "barber_units_barberId_idx" ON "barber_units"("barberId");

-- CreateIndex
CREATE UNIQUE INDEX "barber_units_barberId_unitId_key" ON "barber_units"("barberId", "unitId");

-- CreateIndex
CREATE INDEX "unit_weekly_availabilities_companyId_idx" ON "unit_weekly_availabilities"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "unit_weekly_availabilities_unitId_weekday_key" ON "unit_weekly_availabilities"("unitId", "weekday");

-- CreateIndex
CREATE INDEX "unit_daily_availabilities_companyId_idx" ON "unit_daily_availabilities"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "unit_daily_availabilities_unitId_date_key" ON "unit_daily_availabilities"("unitId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "barbers_userId_key" ON "barbers"("userId");

-- CreateIndex
CREATE INDEX "barbers_companyId_idx" ON "barbers"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "barbers_companyId_email_key" ON "barbers"("companyId", "email");

-- CreateIndex
CREATE INDEX "services_companyId_idx" ON "services"("companyId");

-- CreateIndex
CREATE INDEX "services_unitId_idx" ON "services"("unitId");

-- CreateIndex
CREATE INDEX "service_professionals_companyId_idx" ON "service_professionals"("companyId");

-- CreateIndex
CREATE INDEX "service_professionals_barberId_idx" ON "service_professionals"("barberId");

-- CreateIndex
CREATE UNIQUE INDEX "service_professionals_serviceId_barberId_key" ON "service_professionals"("serviceId", "barberId");

-- CreateIndex
CREATE INDEX "plans_companyId_idx" ON "plans"("companyId");

-- CreateIndex
CREATE INDEX "plan_services_companyId_idx" ON "plan_services"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "plan_services_planId_serviceId_key" ON "plan_services"("planId", "serviceId");

-- CreateIndex
CREATE INDEX "client_plans_companyId_idx" ON "client_plans"("companyId");

-- CreateIndex
CREATE INDEX "client_plans_clientId_idx" ON "client_plans"("clientId");

-- CreateIndex
CREATE INDEX "client_plans_planId_idx" ON "client_plans"("planId");

-- CreateIndex
CREATE INDEX "appointments_companyId_idx" ON "appointments"("companyId");

-- CreateIndex
CREATE INDEX "appointments_unitId_idx" ON "appointments"("unitId");

-- CreateIndex
CREATE INDEX "appointments_clientId_idx" ON "appointments"("clientId");

-- CreateIndex
CREATE INDEX "appointments_barberId_idx" ON "appointments"("barberId");

-- CreateIndex
CREATE INDEX "appointments_scheduleAt_idx" ON "appointments"("scheduleAt");

-- CreateIndex
CREATE INDEX "appointments_serviceId_idx" ON "appointments"("serviceId");

-- CreateIndex
CREATE INDEX "appointments_clientPlanId_idx" ON "appointments"("clientPlanId");

-- CreateIndex
CREATE INDEX "appointments_barberId_scheduleAt_idx" ON "appointments"("barberId", "scheduleAt");

-- CreateIndex
CREATE INDEX "appointments_concludedByUserId_idx" ON "appointments"("concludedByUserId");

-- CreateIndex
CREATE INDEX "appointments_concludedByBarberId_idx" ON "appointments"("concludedByBarberId");

-- CreateIndex
CREATE INDEX "appointments_cancelledByUserId_idx" ON "appointments"("cancelledByUserId");

-- CreateIndex
CREATE INDEX "appointments_cancelledByBarberId_idx" ON "appointments"("cancelledByBarberId");

-- CreateIndex
CREATE UNIQUE INDEX "barber_cancellation_fees_appointmentId_key" ON "barber_cancellation_fees"("appointmentId");

-- CreateIndex
CREATE INDEX "barber_cancellation_fees_companyId_createdAt_idx" ON "barber_cancellation_fees"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "barber_cancellation_fees_barberId_createdAt_idx" ON "barber_cancellation_fees"("barberId", "createdAt");

-- CreateIndex
CREATE INDEX "barber_cancellation_fees_unitId_createdAt_idx" ON "barber_cancellation_fees"("unitId", "createdAt");

-- CreateIndex
CREATE INDEX "Product_companyId_idx" ON "Product"("companyId");

-- CreateIndex
CREATE INDEX "Product_unitId_idx" ON "Product"("unitId");

-- CreateIndex
CREATE INDEX "Product_isFeatured_idx" ON "Product"("isFeatured");

-- CreateIndex
CREATE INDEX "product_prices_by_level_companyId_idx" ON "product_prices_by_level"("companyId");

-- CreateIndex
CREATE INDEX "product_prices_by_level_level_idx" ON "product_prices_by_level"("level");

-- CreateIndex
CREATE UNIQUE INDEX "product_prices_by_level_productId_level_key" ON "product_prices_by_level"("productId", "level");

-- CreateIndex
CREATE INDEX "ProductSale_companyId_idx" ON "ProductSale"("companyId");

-- CreateIndex
CREATE INDEX "ProductSale_unitId_idx" ON "ProductSale"("unitId");

-- CreateIndex
CREATE INDEX "ProductSale_productId_idx" ON "ProductSale"("productId");

-- CreateIndex
CREATE INDEX "ProductSale_barberId_idx" ON "ProductSale"("barberId");

-- CreateIndex
CREATE INDEX "ProductSale_soldAt_idx" ON "ProductSale"("soldAt");

-- CreateIndex
CREATE UNIQUE INDEX "orders_appointmentId_key" ON "orders"("appointmentId");

-- CreateIndex
CREATE INDEX "orders_companyId_idx" ON "orders"("companyId");

-- CreateIndex
CREATE INDEX "orders_unitId_idx" ON "orders"("unitId");

-- CreateIndex
CREATE INDEX "orders_clientId_idx" ON "orders"("clientId");

-- CreateIndex
CREATE INDEX "orders_appointmentId_idx" ON "orders"("appointmentId");

-- CreateIndex
CREATE INDEX "orders_barberId_idx" ON "orders"("barberId");

-- CreateIndex
CREATE INDEX "order_items_companyId_idx" ON "order_items"("companyId");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_productId_idx" ON "order_items"("productId");

-- CreateIndex
CREATE INDEX "order_items_serviceId_idx" ON "order_items"("serviceId");

-- CreateIndex
CREATE INDEX "expenses_companyId_idx" ON "expenses"("companyId");

-- CreateIndex
CREATE INDEX "expenses_unitId_idx" ON "expenses"("unitId");

-- CreateIndex
CREATE INDEX "expenses_dueDate_idx" ON "expenses"("dueDate");

-- CreateIndex
CREATE INDEX "barber_weekly_availabilities_companyId_idx" ON "barber_weekly_availabilities"("companyId");

-- CreateIndex
CREATE INDEX "barber_weekly_availabilities_unitId_idx" ON "barber_weekly_availabilities"("unitId");

-- CreateIndex
CREATE INDEX "barber_weekly_availabilities_barberId_weekday_idx" ON "barber_weekly_availabilities"("barberId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "barber_weekly_availabilities_barberId_unitId_weekday_key" ON "barber_weekly_availabilities"("barberId", "unitId", "weekday");

-- CreateIndex
CREATE INDEX "barber_daily_availabilities_companyId_idx" ON "barber_daily_availabilities"("companyId");

-- CreateIndex
CREATE INDEX "barber_daily_availabilities_unitId_idx" ON "barber_daily_availabilities"("unitId");

-- CreateIndex
CREATE INDEX "barber_daily_availabilities_barberId_date_idx" ON "barber_daily_availabilities"("barberId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "barber_daily_availabilities_barberId_unitId_date_key" ON "barber_daily_availabilities"("barberId", "unitId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_reviews_appointmentId_key" ON "appointment_reviews"("appointmentId");

-- CreateIndex
CREATE INDEX "appointment_reviews_companyId_idx" ON "appointment_reviews"("companyId");

-- CreateIndex
CREATE INDEX "appointment_reviews_clientId_idx" ON "appointment_reviews"("clientId");

-- CreateIndex
CREATE INDEX "appointment_reviews_barberId_idx" ON "appointment_reviews"("barberId");

-- CreateIndex
CREATE INDEX "review_tags_companyId_idx" ON "review_tags"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "review_tags_companyId_label_key" ON "review_tags"("companyId", "label");

-- CreateIndex
CREATE INDEX "appointment_review_tags_tagId_idx" ON "appointment_review_tags"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_review_tags_reviewId_tagId_key" ON "appointment_review_tags"("reviewId", "tagId");

-- CreateIndex
CREATE INDEX "admin_access_companyId_idx" ON "admin_access"("companyId");

-- CreateIndex
CREATE INDEX "admin_access_unitId_idx" ON "admin_access"("unitId");

-- CreateIndex
CREATE INDEX "admin_access_userId_idx" ON "admin_access"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "admin_access_companyId_userId_key" ON "admin_access"("companyId", "userId");

-- CreateIndex
CREATE INDEX "analytics_events_companyId_createdAt_idx" ON "analytics_events"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_events_unitId_createdAt_idx" ON "analytics_events"("unitId", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_events_userId_createdAt_idx" ON "analytics_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_events_name_createdAt_idx" ON "analytics_events"("name", "createdAt");

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_lastUnitId_fkey" FOREIGN KEY ("lastUnitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_level_configs" ADD CONSTRAINT "customer_level_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_level_configs" ADD CONSTRAINT "customer_level_configs_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_level_rules" ADD CONSTRAINT "customer_level_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_level_rules" ADD CONSTRAINT "customer_level_rules_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_level_states" ADD CONSTRAINT "customer_level_states_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_level_states" ADD CONSTRAINT "customer_level_states_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_level_states" ADD CONSTRAINT "customer_level_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_level_periods" ADD CONSTRAINT "customer_level_periods_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_level_periods" ADD CONSTRAINT "customer_level_periods_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_level_periods" ADD CONSTRAINT "customer_level_periods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_units" ADD CONSTRAINT "barber_units_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_units" ADD CONSTRAINT "barber_units_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "barbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_units" ADD CONSTRAINT "barber_units_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_weekly_availabilities" ADD CONSTRAINT "unit_weekly_availabilities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_weekly_availabilities" ADD CONSTRAINT "unit_weekly_availabilities_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_weekly_time_intervals" ADD CONSTRAINT "unit_weekly_time_intervals_weeklyAvailabilityId_fkey" FOREIGN KEY ("weeklyAvailabilityId") REFERENCES "unit_weekly_availabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_daily_availabilities" ADD CONSTRAINT "unit_daily_availabilities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_daily_availabilities" ADD CONSTRAINT "unit_daily_availabilities_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_daily_time_intervals" ADD CONSTRAINT "unit_daily_time_intervals_dailyAvailabilityId_fkey" FOREIGN KEY ("dailyAvailabilityId") REFERENCES "unit_daily_availabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barbers" ADD CONSTRAINT "barbers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barbers" ADD CONSTRAINT "barbers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_professionals" ADD CONSTRAINT "service_professionals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_professionals" ADD CONSTRAINT "service_professionals_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_professionals" ADD CONSTRAINT "service_professionals_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "barbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_services" ADD CONSTRAINT "plan_services_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_services" ADD CONSTRAINT "plan_services_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_services" ADD CONSTRAINT "plan_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_plans" ADD CONSTRAINT "client_plans_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_plans" ADD CONSTRAINT "client_plans_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_plans" ADD CONSTRAINT "client_plans_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "barbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_concludedByUserId_fkey" FOREIGN KEY ("concludedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_concludedByBarberId_fkey" FOREIGN KEY ("concludedByBarberId") REFERENCES "barbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_cancelledByBarberId_fkey" FOREIGN KEY ("cancelledByBarberId") REFERENCES "barbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clientPlanId_fkey" FOREIGN KEY ("clientPlanId") REFERENCES "client_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_cancellation_fees" ADD CONSTRAINT "barber_cancellation_fees_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_cancellation_fees" ADD CONSTRAINT "barber_cancellation_fees_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_cancellation_fees" ADD CONSTRAINT "barber_cancellation_fees_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "barbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_cancellation_fees" ADD CONSTRAINT "barber_cancellation_fees_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices_by_level" ADD CONSTRAINT "product_prices_by_level_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices_by_level" ADD CONSTRAINT "product_prices_by_level_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSale" ADD CONSTRAINT "ProductSale_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSale" ADD CONSTRAINT "ProductSale_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSale" ADD CONSTRAINT "ProductSale_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSale" ADD CONSTRAINT "ProductSale_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "barbers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "barbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_weekly_availabilities" ADD CONSTRAINT "barber_weekly_availabilities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_weekly_availabilities" ADD CONSTRAINT "barber_weekly_availabilities_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "barbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_weekly_availabilities" ADD CONSTRAINT "barber_weekly_availabilities_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_weekly_time_intervals" ADD CONSTRAINT "barber_weekly_time_intervals_weeklyAvailabilityId_fkey" FOREIGN KEY ("weeklyAvailabilityId") REFERENCES "barber_weekly_availabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_daily_availabilities" ADD CONSTRAINT "barber_daily_availabilities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_daily_availabilities" ADD CONSTRAINT "barber_daily_availabilities_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "barbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_daily_availabilities" ADD CONSTRAINT "barber_daily_availabilities_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_daily_time_intervals" ADD CONSTRAINT "barber_daily_time_intervals_dailyAvailabilityId_fkey" FOREIGN KEY ("dailyAvailabilityId") REFERENCES "barber_daily_availabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_reviews" ADD CONSTRAINT "appointment_reviews_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_reviews" ADD CONSTRAINT "appointment_reviews_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_reviews" ADD CONSTRAINT "appointment_reviews_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_reviews" ADD CONSTRAINT "appointment_reviews_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "barbers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_tags" ADD CONSTRAINT "review_tags_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_review_tags" ADD CONSTRAINT "appointment_review_tags_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "appointment_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_review_tags" ADD CONSTRAINT "appointment_review_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "review_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_access" ADD CONSTRAINT "admin_access_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_access" ADD CONSTRAINT "admin_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_access" ADD CONSTRAINT "admin_access_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
