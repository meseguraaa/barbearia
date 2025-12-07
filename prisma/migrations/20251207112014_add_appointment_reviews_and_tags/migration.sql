/*
  Warnings:

  - The primary key for the `service_professionals` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[serviceId,barberId]` on the table `service_professionals` will be added. If there are existing duplicate values, this will fail.
  - The required column `id` was added to the `service_professionals` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "reviewModalShown" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "service_professionals" DROP CONSTRAINT "service_professionals_pkey",
ADD COLUMN     "id" TEXT NOT NULL,
ADD CONSTRAINT "service_professionals_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "appointment_reviews" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "isAnonymousForProfessional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_tags" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_review_tags" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_review_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "appointment_reviews_appointmentId_key" ON "appointment_reviews"("appointmentId");

-- CreateIndex
CREATE INDEX "appointment_reviews_clientId_idx" ON "appointment_reviews"("clientId");

-- CreateIndex
CREATE INDEX "appointment_reviews_barberId_idx" ON "appointment_reviews"("barberId");

-- CreateIndex
CREATE UNIQUE INDEX "review_tags_label_key" ON "review_tags"("label");

-- CreateIndex
CREATE INDEX "appointment_review_tags_tagId_idx" ON "appointment_review_tags"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_review_tags_reviewId_tagId_key" ON "appointment_review_tags"("reviewId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "service_professionals_serviceId_barberId_key" ON "service_professionals"("serviceId", "barberId");

-- AddForeignKey
ALTER TABLE "appointment_reviews" ADD CONSTRAINT "appointment_reviews_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_reviews" ADD CONSTRAINT "appointment_reviews_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_reviews" ADD CONSTRAINT "appointment_reviews_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "barbers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_review_tags" ADD CONSTRAINT "appointment_review_tags_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "appointment_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_review_tags" ADD CONSTRAINT "appointment_review_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "review_tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
