/*
  Warnings:

  - You are about to drop the column `isbn` on the `ImportTarget` table. All the data in the column will be lost.
  - You are about to drop the column `pageCount` on the `ImportTarget` table. All the data in the column will be lost.
  - You are about to drop the column `isbn` on the `Work` table. All the data in the column will be lost.
  - You are about to drop the column `pageCount` on the `Work` table. All the data in the column will be lost.

*/

-- Remise à zéro assumée : la couverture d'un média de lecture appartient
-- désormais à son édition. Aucune reprise — les visuels sont à ressaisir
-- depuis la fiche, édition par édition.
UPDATE "Work" SET "coverImageId" = NULL
WHERE "type" IN ('BOOK', 'BD_SERIES', 'MANGA_SERIES');

-- AlterTable
ALTER TABLE "Edition" ADD COLUMN     "language" TEXT,
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "ImportTarget" DROP COLUMN "isbn",
DROP COLUMN "pageCount";

-- AlterTable
ALTER TABLE "Work" DROP COLUMN "isbn",
DROP COLUMN "pageCount",
ADD COLUMN     "originalLanguage" TEXT;

-- CreateTable
CREATE TABLE "EditionCreator" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "EditionCreator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EditionCreator_personId_idx" ON "EditionCreator"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "EditionCreator_editionId_personId_role_key" ON "EditionCreator"("editionId", "personId", "role");

-- AddForeignKey
ALTER TABLE "EditionCreator" ADD CONSTRAINT "EditionCreator_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditionCreator" ADD CONSTRAINT "EditionCreator_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
