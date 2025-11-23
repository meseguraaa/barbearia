-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "barberEarningValue" DECIMAL(10,2),
ADD COLUMN     "barberPercentageAtTheTime" DECIMAL(5,2),
ADD COLUMN     "servicePriceAtTheTime" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "barberPercentage" DECIMAL(5,2) NOT NULL DEFAULT 50.0;
