import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { WorkType } from "@/generated/prisma/enums";
import { db } from "./db";
import { normalizeTitle } from "./text";

export type WorkSearchResult = {
  id: string;
  type: WorkType;
  titleFr: string;
  titleOriginal: string | null;
  year: number | null; // null pour une fiche importée sans année (lot 2)
  coverImageId: string | null;
  sim: number;
};

/**
 * Recherche interne (S1) tolérante aux fautes via pg_trgm.
 * Cherche sur le titre normalisé (trigrammes) et, en secours, sur l'ISBN saisi.
 */
export async function searchWorks(
  rawQuery: string,
  type?: WorkType,
): Promise<WorkSearchResult[]> {
  const q = normalizeTitle(rawQuery);
  if (!q) return [];
  const isbn = rawQuery.replace(/[^0-9Xx]/g, "");

  const typeClause = type
    ? Prisma.sql`AND w."type" = ${type}::"WorkType"`
    : Prisma.empty;

  return db.$queryRaw<WorkSearchResult[]>(Prisma.sql`
    SELECT
      w."id",
      w."type",
      w."titleFr",
      w."titleOriginal",
      w."year",
      w."coverImageId",
      GREATEST(
        similarity(w."titleNormalized", ${q}),
        CASE WHEN w."isbn" IS NOT NULL AND w."isbn" = ${isbn} AND ${isbn} <> '' THEN 1 ELSE 0 END
      ) AS "sim"
    FROM "Work" w
    WHERE (
      w."titleNormalized" % ${q}
      OR w."titleNormalized" ILIKE ${"%" + q + "%"}
      OR (${isbn} <> '' AND w."isbn" = ${isbn})
    )
    ${typeClause}
    ORDER BY "sim" DESC, w."year" DESC NULLS LAST
    LIMIT 40
  `);
}

export type DuplicateCandidate = {
  id: string;
  type: WorkType;
  titleFr: string;
  year: number | null;
  coverImageId: string | null;
  sim: number;
};

/**
 * Détection de doublons à la volée (S2, D31) : titre proche ET année ±1.
 * Une année inconnue (fiche importée, lot 2) lève la contrainte d'année :
 * on ne peut pas comparer ce qu'on n'a pas.
 */
export async function findDuplicateWorks(
  rawTitle: string,
  year: number | null,
): Promise<DuplicateCandidate[]> {
  const norm = normalizeTitle(rawTitle);
  if (!norm) return [];

  const yearClause =
    year === null
      ? Prisma.empty
      : Prisma.sql`AND (w."year" IS NULL OR abs(w."year" - ${year}) <= 1)`;

  return db.$queryRaw<DuplicateCandidate[]>(Prisma.sql`
    SELECT
      w."id",
      w."type",
      w."titleFr",
      w."year",
      w."coverImageId",
      similarity(w."titleNormalized", ${norm}) AS "sim"
    FROM "Work" w
    WHERE w."titleNormalized" % ${norm}
      ${yearClause}
    ORDER BY "sim" DESC
    LIMIT 5
  `);
}
