-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_barberId_fkey";

-- AlterTable
ALTER TABLE "appointments" ALTER COLUMN "barberId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "barbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
