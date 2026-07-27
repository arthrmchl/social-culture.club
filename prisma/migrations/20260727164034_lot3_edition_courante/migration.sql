-- AlterTable
ALTER TABLE "UserWork" ADD COLUMN     "editionId" TEXT;

-- AddForeignKey
ALTER TABLE "UserWork" ADD CONSTRAINT "UserWork_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
