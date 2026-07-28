-- « One-shot » n'est plus un type d'œuvre : un manga en un volume est un manga
-- d'un tome. Les données sont reprises AVANT la recréation des types — un
-- ALTER TYPE ne sait pas perdre une valeur, et la recréation échouerait sur
-- toute ligne restée en 'ONE_SHOT'.

-- 1. Le tome n° 1 des œuvres converties. La pagination de la fiche devient
--    celle du tome ; le NOT EXISTS respecte "Tome_workId_number_key".
INSERT INTO "Tome" ("id", "workId", "number", "pageCount")
SELECT gen_random_uuid()::text, w."id", 1, w."pageCount"
FROM "Work" w
WHERE w."type" = 'ONE_SHOT'
  AND NOT EXISTS (
    SELECT 1 FROM "Tome" t WHERE t."workId" = w."id" AND t."number" = 1
  );

-- 2. Reprise du suivi : le suivi passe de la page (L2) au tome (L4). Une
--    lecture terminée reste terminée, une lecture entamée reste en cours —
--    sans cela la fiche afficherait un tome vierge.
INSERT INTO "TomeProgress" ("id", "userId", "tomeId", "state", "updatedAt")
SELECT
  gen_random_uuid()::text,
  uw."userId",
  t."id",
  CASE
    WHEN uw."state" = 'COMPLETED' THEN 'READ'::"TomeState"
    ELSE 'READING'::"TomeState"
  END,
  CURRENT_TIMESTAMP
FROM "UserWork" uw
JOIN "Work" w ON w."id" = uw."workId"
JOIN "Tome" t ON t."workId" = w."id" AND t."number" = 1
WHERE w."type" = 'ONE_SHOT'
  AND (
    uw."state" = 'COMPLETED'
    OR uw."currentPage" IS NOT NULL
    OR uw."progressPercent" IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM "TomeProgress" tp
    WHERE tp."userId" = uw."userId" AND tp."tomeId" = t."id"
  );

-- 3. Le type lui-même, sur les deux seules colonnes en "WorkType".
UPDATE "Work" SET "type" = 'MANGA_SERIES' WHERE "type" = 'ONE_SHOT';
UPDATE "ImportTarget" SET "type" = 'MANGA_SERIES' WHERE "type" = 'ONE_SHOT';

-- 4. Objectifs : @@unique([userId, year, scope]) interdit un report vers
--    MANGA_SERIES quand l'objectif mangas existe déjà. Un objectif annuel est
--    une intention, pas un historique : il se resaisit.
DELETE FROM "Goal" WHERE "scope" = 'ONE_SHOT';

-- AlterEnum
BEGIN;
CREATE TYPE "WorkType_new" AS ENUM ('FILM', 'SERIES', 'ANIME', 'BOOK', 'BD_SERIES', 'MANGA_SERIES');
ALTER TABLE "Work" ALTER COLUMN "type" TYPE "WorkType_new" USING ("type"::text::"WorkType_new");
ALTER TABLE "ImportTarget" ALTER COLUMN "type" TYPE "WorkType_new" USING ("type"::text::"WorkType_new");
ALTER TYPE "WorkType" RENAME TO "WorkType_old";
ALTER TYPE "WorkType_new" RENAME TO "WorkType";
DROP TYPE "WorkType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "GoalScope_new" AS ENUM ('ALL', 'READINGS', 'FILM', 'SERIES', 'ANIME', 'BOOK', 'BD_SERIES', 'MANGA_SERIES');
ALTER TABLE "Goal" ALTER COLUMN "scope" TYPE "GoalScope_new" USING ("scope"::text::"GoalScope_new");
ALTER TYPE "GoalScope" RENAME TO "GoalScope_old";
ALTER TYPE "GoalScope_new" RENAME TO "GoalScope";
DROP TYPE "GoalScope_old";
COMMIT;
