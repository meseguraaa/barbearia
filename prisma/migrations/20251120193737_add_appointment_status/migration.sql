-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'DONE', 'CANCELED');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING';
