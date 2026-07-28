-- Lot 6 — le manga tel qu'il se publie.
--
-- Trois corrections d'un même travers : l'œuvre porte ce qui appartient au
-- tirage. Une série se publie sur une **période** ; un manga a des
-- **auteur·rice·s** ; et le nombre de **tomes** décrit une édition, pas un
-- texte — Berserk fait 41 tomes chez Glénat et 14 en Deluxe.
--
-- La reprise des données précède les DDL destructives : chaque tome doit avoir
-- trouvé son édition avant que `Tome.workId` disparaisse.

-- 1. L'année de fin des œuvres sérielles. Nulle = publication en cours.
ALTER TABLE "Work" ADD COLUMN "endYear" INTEGER;

-- 2. Les créateurs sans rôle d'un manga sont ses auteur·rice·s. Le NOT EXISTS
--    protège `@@unique([workId, personId, role])` : PostgreSQL traitant les
--    NULL comme distincts, la même personne peut déjà y figurer en « auteur ».
UPDATE "WorkCreator" wc
SET "role" = 'auteur'
FROM "Work" w
WHERE w."id" = wc."workId"
  AND w."type" = 'MANGA_SERIES'
  AND wc."role" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "WorkCreator" autre
    WHERE autre."workId" = wc."workId"
      AND autre."personId" = wc."personId"
      AND autre."role" = 'auteur'
  );

-- 3. Une édition ne s'attache plus à un tome : elle les contient. Celles qui
--    l'étaient reprennent l'œuvre de leur tome, sinon leur `workId` ne pourrait
--    pas devenir NOT NULL.
UPDATE "Edition" e
SET "workId" = t."workId"
FROM "Tome" t
WHERE e."tomeId" = t."id" AND e."workId" IS NULL;

-- Une édition rattachée à rien du tout n'a jamais été atteignable : elle ne
-- survit pas au passage en NOT NULL, et personne ne la regrettera.
DELETE FROM "Edition" WHERE "workId" IS NULL;

-- 4. L'édition d'accueil des tomes existants : la plus ancienne édition
--    ordinaire de l'œuvre (une intégrale a ses propres volumes, elle ne peut
--    pas héberger la série entière), sinon une édition neuve.
CREATE TEMP TABLE "_edition_accueil" AS
SELECT DISTINCT ON (t."workId")
  t."workId" AS work_id,
  e."id"     AS edition_id
FROM "Tome" t
LEFT JOIN "Edition" e
  ON e."workId" = t."workId"
 AND e."coversTomeFrom" IS NULL
 AND e."coversTomeTo" IS NULL
ORDER BY t."workId", e."createdAt" ASC NULLS LAST;

INSERT INTO "Edition" ("id", "workId", "isDefault", "createdAt")
SELECT
  gen_random_uuid()::text,
  h.work_id,
  NOT EXISTS (
    SELECT 1 FROM "Edition" e2 WHERE e2."workId" = h.work_id AND e2."isDefault"
  ),
  now()
FROM "_edition_accueil" h
WHERE h.edition_id IS NULL;

UPDATE "_edition_accueil" h
SET edition_id = e."id"
FROM "Edition" e
WHERE h.edition_id IS NULL
  AND e."workId" = h.work_id
  AND e."coversTomeFrom" IS NULL
  AND e."coversTomeTo" IS NULL;

-- 5. Les tomes rejoignent cette édition. Leurs identifiants ne bougent pas :
--    `TomeProgress` et `JournalEntry.tomeId` restent valides, le suivi déjà
--    consigné est intégralement conservé.
ALTER TABLE "Tome" ADD COLUMN "editionId" TEXT;

UPDATE "Tome" t
SET "editionId" = h.edition_id
FROM "_edition_accueil" h
WHERE h.work_id = t."workId";

-- 6. Un tome ne se coche plus que dans un tirage désigné : les membres qui
--    suivaient déjà une série se voient attribuer l'édition d'accueil, faute
--    de quoi la fiche leur demanderait de choisir avant de leur rendre leurs
--    tomes lus.
UPDATE "UserWork" uw
SET "editionId" = h.edition_id
FROM "_edition_accueil" h
WHERE uw."workId" = h.work_id AND uw."editionId" IS NULL;

-- 7. Les intégrales existantes perdent leur étendue : remise à zéro assumée,
--    comme le lot 5 l'a fait des couvertures. Une intégrale se redéclare en
--    saisissant ses propres tomes.

-- AlterTable
ALTER TABLE "Tome" ALTER COLUMN "editionId" SET NOT NULL;
ALTER TABLE "Tome" DROP COLUMN "workId";

-- AlterTable
ALTER TABLE "Edition" DROP COLUMN "tomeId",
                      DROP COLUMN "coversTomeFrom",
                      DROP COLUMN "coversTomeTo",
                      ALTER COLUMN "workId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Tome_editionId_number_key" ON "Tome"("editionId", "number");

-- AddForeignKey
ALTER TABLE "Tome" ADD CONSTRAINT "Tome_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
