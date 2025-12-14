-- AlterTable
ALTER TABLE "ProductSale" ADD COLUMN     "unitId" TEXT;

-- CreateIndex
CREATE INDEX "ProductSale_unitId_idx" ON "ProductSale"("unitId");

-- AddForeignKey
ALTER TABLE "ProductSale" ADD CONSTRAINT "ProductSale_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
