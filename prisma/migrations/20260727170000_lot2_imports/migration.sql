-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('LETTERBOXD', 'GOODREADS', 'SERIALIZD', 'SCC');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('UPLOADED', 'ANALYZED', 'APPLYING', 'APPLIED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportResolution" AS ENUM ('LINK', 'CREATE', 'IGNORE');

-- CreateEnum
CREATE TYPE "ImportDecidedBy" AS ENUM ('AUTO', 'USER');

-- CreateEnum
CREATE TYPE "ImportRowKind" AS ENUM ('LOG', 'RATING', 'REVIEW', 'LIKE', 'WATCHLIST', 'STATE', 'PROGRESS', 'LIST_ITEM', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('PENDING', 'APPLIED', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN     "importKey" TEXT;

-- AlterTable
ALTER TABLE "Work" ADD COLUMN     "needsCompletion" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "year" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "ImportSource" NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'UPLOADED',
    "label" TEXT,
    "options" JSONB NOT NULL DEFAULT '{}',
    "stats" JSONB NOT NULL DEFAULT '{}',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyzedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportFile" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parsed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ImportFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportTarget" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "workKey" TEXT NOT NULL,
    "externalId" TEXT,
    "type" "WorkType" NOT NULL,
    "titleFr" TEXT NOT NULL,
    "titleOriginal" TEXT,
    "titleNormalized" TEXT NOT NULL,
    "year" INTEGER,
    "isbn" TEXT,
    "pageCount" INTEGER,
    "creators" TEXT[],
    "extra" JSONB NOT NULL DEFAULT '{}',
    "candidates" JSONB NOT NULL DEFAULT '[]',
    "resolution" "ImportResolution",
    "decidedBy" "ImportDecidedBy",
    "confidence" DOUBLE PRECISION,
    "matchedWorkId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "ImportTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "targetId" TEXT,
    "kind" "ImportRowKind" NOT NULL,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'PENDING',
    "sourceFile" TEXT NOT NULL,
    "sourceLine" INTEGER NOT NULL,
    "raw" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "importKey" TEXT NOT NULL,
    "result" JSONB,
    "error" TEXT,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportBatch_userId_createdAt_idx" ON "ImportBatch"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportFile_batchId_idx" ON "ImportFile"("batchId");

-- CreateIndex
CREATE INDEX "ImportTarget_batchId_resolution_idx" ON "ImportTarget"("batchId", "resolution");

-- CreateIndex
CREATE INDEX "ImportTarget_matchedWorkId_idx" ON "ImportTarget"("matchedWorkId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportTarget_batchId_workKey_key" ON "ImportTarget"("batchId", "workKey");

-- CreateIndex
CREATE INDEX "ImportRow_batchId_status_idx" ON "ImportRow"("batchId", "status");

-- CreateIndex
CREATE INDEX "ImportRow_targetId_idx" ON "ImportRow"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_userId_importKey_key" ON "JournalEntry"("userId", "importKey");

-- CreateIndex
CREATE INDEX "Work_needsCompletion_idx" ON "Work"("needsCompletion");

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportFile" ADD CONSTRAINT "ImportFile_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportTarget" ADD CONSTRAINT "ImportTarget_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportTarget" ADD CONSTRAINT "ImportTarget_matchedWorkId_fkey" FOREIGN KEY ("matchedWorkId") REFERENCES "Work"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "ImportTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

