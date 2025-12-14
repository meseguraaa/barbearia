-- DropForeignKey
ALTER TABLE "AdminAccess" DROP CONSTRAINT "AdminAccess_userId_fkey";

-- DropForeignKey
ALTER TABLE "appointment_review_tags" DROP CONSTRAINT "appointment_review_tags_tagId_fkey";

-- AlterTable
ALTER TABLE "AdminAccess" ADD COLUMN     "unitId" TEXT;

-- CreateIndex
CREATE INDEX "AdminAccess_unitId_idx" ON "AdminAccess"("unitId");

-- AddForeignKey
ALTER TABLE "appointment_review_tags" ADD CONSTRAINT "appointment_review_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "review_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAccess" ADD CONSTRAINT "AdminAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAccess" ADD CONSTRAINT "AdminAccess_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
