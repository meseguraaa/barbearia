-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "cancelFeeApplied" BOOLEAN,
ADD COLUMN     "cancelFeeValue" DECIMAL(10,2),
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledByRole" TEXT;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "cancelFeePercentage" DECIMAL(5,2),
ADD COLUMN     "cancelLimitHours" INTEGER;
