-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "pickupDeadlineDays" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "expiredAt" TIMESTAMP(3),
ADD COLUMN     "inventoryRevertedAt" TIMESTAMP(3),
ADD COLUMN     "reservedUntil" TIMESTAMP(3);
