/*
  Warnings:

  - Made the column `unitId` on table `ProductSale` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "ProductSale" DROP CONSTRAINT "ProductSale_unitId_fkey";

-- AlterTable
ALTER TABLE "ProductSale" ALTER COLUMN "unitId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "ProductSale" ADD CONSTRAINT "ProductSale_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
