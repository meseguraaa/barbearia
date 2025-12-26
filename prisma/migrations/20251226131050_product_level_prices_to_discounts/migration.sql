/*
  Warnings:

  - You are about to drop the column `price` on the `product_prices_by_level` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "product_prices_by_level" DROP COLUMN "price",
ADD COLUMN     "discountPct" INTEGER NOT NULL DEFAULT 0;
