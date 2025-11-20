/*
  Warnings:

  - Added the required column `barberId` to the `appointments` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "barberId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "barbers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "barbers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointments_barberId_scheduleAt_idx" ON "appointments"("barberId", "scheduleAt");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "barbers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "barbers" (id, name, "isActive")
VALUES
  (gen_random_uuid(), 'Jeff', true),
  (gen_random_uuid(), 'Matheus', true),
  (gen_random_uuid(), 'Rafa', true),
  (gen_random_uuid(), 'Thiago', true);

