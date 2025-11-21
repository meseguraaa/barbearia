/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `barbers` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "barbers" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "barbers_userId_key" ON "barbers"("userId");

-- AddForeignKey
ALTER TABLE "barbers" ADD CONSTRAINT "barbers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
