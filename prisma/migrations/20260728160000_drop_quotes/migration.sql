-- DropForeignKey
ALTER TABLE "Quote" DROP CONSTRAINT "Quote_editionId_fkey";

-- DropForeignKey
ALTER TABLE "Quote" DROP CONSTRAINT "Quote_tomeId_fkey";

-- DropForeignKey
ALTER TABLE "Quote" DROP CONSTRAINT "Quote_userId_fkey";

-- DropForeignKey
ALTER TABLE "Quote" DROP CONSTRAINT "Quote_workId_fkey";

-- DropTable
DROP TABLE "Quote";

