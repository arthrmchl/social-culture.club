-- Retrait de la fonctionnalité d'import (lot 2).
--
-- Rien à reprendre : ce que l'import a produit — œuvres, entrées de journal,
-- listes — vit dans les tables ordinaires et ne référence aucune de celles-ci.
-- Seul disparaît le chantier lui-même : les fichiers téléversés, les cibles de
-- rapprochement et les lignes brutes.
--
-- `JournalEntry.importKey` et `List.importKey` sont **conservées**, inertes :
-- elles disent d'où vient une entrée, et le fil (`src/lib/social/feed-query.ts`)
-- continue de s'en servir pour ne pas relâcher un historique importé dans
-- l'actualité des abonnés.

-- 1. Les tables, dans l'ordre des dépendances (ImportRow et ImportTarget
--    portent les clés étrangères).
DROP TABLE "ImportRow";
DROP TABLE "ImportTarget";
DROP TABLE "ImportFile";
DROP TABLE "ImportBatch";

-- 2. Les énumérés, plus référencés par aucune colonne.
DROP TYPE "ImportRowStatus";
DROP TYPE "ImportRowKind";
DROP TYPE "ImportDecidedBy";
DROP TYPE "ImportResolution";
DROP TYPE "ImportBatchStatus";
DROP TYPE "ImportSource";
