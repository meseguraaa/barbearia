/*
  Warnings:

  - You are about to drop the column `tutorName` on the `appointments` table. All the data in the column will be lost.
  - Added the required column `clientName` to the `appointments` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "appointments" DROP COLUMN "tutorName",
ADD COLUMN     "clientName" TEXT NOT NULL;
