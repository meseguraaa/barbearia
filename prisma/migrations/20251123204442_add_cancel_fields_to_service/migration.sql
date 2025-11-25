/*
  Warnings:

  - You are about to drop the column `cancelledAt` on the `appointments` table. All the data in the column will be lost.
  - The `cancelledByRole` column on the `appointments` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Made the column `cancelFeeApplied` on table `appointments` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "appointments" DROP COLUMN "cancelledAt",
ALTER COLUMN "cancelFeeApplied" SET NOT NULL,
ALTER COLUMN "cancelFeeApplied" SET DEFAULT false,
DROP COLUMN "cancelledByRole",
ADD COLUMN     "cancelledByRole" "Role";
