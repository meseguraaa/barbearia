-- CreateTable
CREATE TABLE "barber_cancellation_fees" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "barber_cancellation_fees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "barber_cancellation_fees_appointmentId_key" ON "barber_cancellation_fees"("appointmentId");

-- CreateIndex
CREATE INDEX "barber_cancellation_fees_barberId_createdAt_idx" ON "barber_cancellation_fees"("barberId", "createdAt");

-- CreateIndex
CREATE INDEX "barber_cancellation_fees_unitId_createdAt_idx" ON "barber_cancellation_fees"("unitId", "createdAt");

-- AddForeignKey
ALTER TABLE "barber_cancellation_fees" ADD CONSTRAINT "barber_cancellation_fees_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_cancellation_fees" ADD CONSTRAINT "barber_cancellation_fees_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "barbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barber_cancellation_fees" ADD CONSTRAINT "barber_cancellation_fees_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
