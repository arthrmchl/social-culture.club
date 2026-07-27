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
  year: number;
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
    ORDER BY "sim" DESC, w."year" DESC
    LIMIT 40
  `);
}

export type DuplicateCandidate = {
  id: string;
  type: WorkType;
  titleFr: string;
  year: number;
  coverImageId: string | null;
  sim: number;
};

/**
 * Détection de doublons à la volée (S2, D31) : titre proche ET année ±1.
 */
export async function findDuplicateWorks(
  rawTitle: string,
  year: number,
): Promise<DuplicateCandidate[]> {
  const norm = normalizeTitle(rawTitle);
  if (!norm) return [];

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
      AND abs(w."year" - ${year}) <= 1
    ORDER BY "sim" DESC
    LIMIT 5
  `);
}
