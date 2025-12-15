-- DropForeignKey
ALTER TABLE "services" DROP CONSTRAINT "services_unitId_fkey";

-- DropIndex
DROP INDEX "services_unitId_idx";

-- AlterTable
ALTER TABLE "services" ALTER COLUMN "unitId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
