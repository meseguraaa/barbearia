-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "cancelledByBarberId" TEXT,
ADD COLUMN     "cancelledByUserId" TEXT,
ADD COLUMN     "concludedByBarberId" TEXT,
ADD COLUMN     "concludedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "appointments_concludedByUserId_idx" ON "appointments"("concludedByUserId");

-- CreateIndex
CREATE INDEX "appointments_concludedByBarberId_idx" ON "appointments"("concludedByBarberId");

-- CreateIndex
CREATE INDEX "appointments_cancelledByUserId_idx" ON "appointments"("cancelledByUserId");

-- CreateIndex
CREATE INDEX "appointments_cancelledByBarberId_idx" ON "appointments"("cancelledByBarberId");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_concludedByUserId_fkey" FOREIGN KEY ("concludedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_concludedByBarberId_fkey" FOREIGN KEY ("concludedByBarberId") REFERENCES "barbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_cancelledByBarberId_fkey" FOREIGN KEY ("cancelledByBarberId") REFERENCES "barbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
