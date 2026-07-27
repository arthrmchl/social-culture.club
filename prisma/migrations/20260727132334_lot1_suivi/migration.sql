-- CreateEnum
CREATE TYPE "WorkStatusState" AS ENUM ('WANT', 'IN_PROGRESS', 'ON_HOLD', 'DROPPED', 'COMPLETED', 'CAUGHT_UP');

-- CreateEnum
CREATE TYPE "DatePrecision" AS ENUM ('DAY', 'MONTH', 'YEAR', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TomeState" AS ENUM ('READING', 'READ');

-- DropIndex
DROP INDEX "Work_titleNormalized_trgm_idx";

-- CreateTable
CREATE TABLE "UserWork" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "state" "WorkStatusState",
    "currentRating" INTEGER,
    "liked" BOOLEAN NOT NULL DEFAULT false,
    "reviewText" TEXT,
    "reviewHasSpoiler" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "currentPage" INTEGER,
    "progressPercent" INTEGER,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "rewatchCount" INTEGER NOT NULL DEFAULT 0,
    "watchlistedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSeason" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "rating" INTEGER,
    "reviewText" TEXT,
    "reviewHasSpoiler" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "seasonId" TEXT,
    "episodeId" TEXT,
    "tomeId" TEXT,
    "editionId" TEXT,
    "loggedAt" TIMESTAMP(3),
    "datePrecision" "DatePrecision" NOT NULL DEFAULT 'DAY',
    "rating" INTEGER,
    "reviewText" TEXT,
    "reviewHasSpoiler" BOOLEAN NOT NULL DEFAULT false,
    "isRewatch" BOOLEAN NOT NULL DEFAULT false,
    "context" TEXT,
    "isSeasonBatch" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpisodeWatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "watchedAt" TIMESTAMP(3),
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EpisodeWatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TomeProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tomeId" TEXT NOT NULL,
    "state" "TomeState" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TomeProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadingProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "editionId" TEXT,
    "page" INTEGER,
    "percent" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserWork_userId_idx" ON "UserWork"("userId");

-- CreateIndex
CREATE INDEX "UserWork_workId_idx" ON "UserWork"("workId");

-- CreateIndex
CREATE INDEX "UserWork_userId_state_idx" ON "UserWork"("userId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "UserWork_userId_workId_key" ON "UserWork"("userId", "workId");

-- CreateIndex
CREATE INDEX "UserSeason_userId_idx" ON "UserSeason"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSeason_userId_seasonId_key" ON "UserSeason"("userId", "seasonId");

-- CreateIndex
CREATE INDEX "JournalEntry_userId_loggedAt_idx" ON "JournalEntry"("userId", "loggedAt");

-- CreateIndex
CREATE INDEX "JournalEntry_workId_idx" ON "JournalEntry"("workId");

-- CreateIndex
CREATE INDEX "EpisodeWatch_userId_idx" ON "EpisodeWatch"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EpisodeWatch_userId_episodeId_key" ON "EpisodeWatch"("userId", "episodeId");

-- CreateIndex
CREATE INDEX "TomeProgress_userId_idx" ON "TomeProgress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TomeProgress_userId_tomeId_key" ON "TomeProgress"("userId", "tomeId");

-- CreateIndex
CREATE INDEX "ReadingProgress_userId_workId_recordedAt_idx" ON "ReadingProgress"("userId", "workId", "recordedAt");

-- AddForeignKey
ALTER TABLE "UserWork" ADD CONSTRAINT "UserWork_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWork" ADD CONSTRAINT "UserWork_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSeason" ADD CONSTRAINT "UserSeason_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSeason" ADD CONSTRAINT "UserSeason_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_tomeId_fkey" FOREIGN KEY ("tomeId") REFERENCES "Tome"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeWatch" ADD CONSTRAINT "EpisodeWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeWatch" ADD CONSTRAINT "EpisodeWatch_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeWatch" ADD CONSTRAINT "EpisodeWatch_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TomeProgress" ADD CONSTRAINT "TomeProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TomeProgress" ADD CONSTRAINT "TomeProgress_tomeId_fkey" FOREIGN KEY ("tomeId") REFERENCES "Tome"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingProgress" ADD CONSTRAINT "ReadingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingProgress" ADD CONSTRAINT "ReadingProgress_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadingProgress" ADD CONSTRAINT "ReadingProgress_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
