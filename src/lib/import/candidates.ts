import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { WorkType } from "@/generated/prisma/enums";
import type { ImportCandidate } from "./match";

/** Une cible telle qu'on l'interroge : sa clé et son identité. */
export type CandidateQuery = {
  key: string;
  titleNormalized: string;
  year: number | null;
  type: WorkType;
};

/** Cibles interrogées en une seule requête. */
const CHUNK = 200;
/** Candidats retenus par cible avant scoring. */
const PER_TARGET = 8;

type Row = {
  key: string;
  id: string;
  type: WorkType;
  titleFr: string;
  titleNormalized: string;
  year: number | null;
  isbn: string | null;
  coverImageId: string | null;
  sim: number;
};

/**
 * Candidats du catalogue pour un lot de cibles (I6).
 *
 * Une requête par paquet de 200 cibles, et non un appel par cible : sur un
 * export réel (des centaines d'œuvres), la différence est celle entre une
 * analyse instantanée et une analyse interminable.
 *
 * L'année n'est volontairement pas filtrée en SQL — elle entre dans le score
 * avec une tolérance qui dépend du média (voir match.ts). Le seuil de
 * similarité reste celui de pg_trgm : on ne touche pas à `set_limit()`, qui
 * s'applique à la connexion et serait partagé avec le reste de l'application.
 */
export async function findImportCandidates(
  queries: CandidateQuery[],
): Promise<Map<string, ImportCandidate[]>> {
  const out = new Map<string, ImportCandidate[]>();
  if (queries.length === 0) return out;

  for (let i = 0; i < queries.length; i += CHUNK) {
    const chunk = queries.slice(i, i + CHUNK);
    const keys = chunk.map((q) => q.key);
    const norms = chunk.map((q) => q.titleNormalized);

    const rows = await db.$queryRaw<Row[]>(Prisma.sql`
      SELECT
        t.key,
        w."id",
        w."type",
        w."titleFr",
        w."titleNormalized",
        w."year",
        w."isbn",
        w."coverImageId",
        similarity(w."titleNormalized", t.norm) AS "sim"
      FROM unnest(${keys}::text[], ${norms}::text[]) AS t(key, norm)
      CROSS JOIN LATERAL (
        SELECT w2.*
        FROM "Work" w2
        WHERE w2."titleNormalized" % t.norm
        ORDER BY similarity(w2."titleNormalized", t.norm) DESC
        LIMIT ${PER_TARGET}
      ) w
    `);

    if (rows.length === 0) continue;

    // Les créateurs alimentent le bonus de scoring : une requête pour tous.
    const workIds = [...new Set(rows.map((r) => r.id))];
    const creators = await db.workCreator.findMany({
      where: { workId: { in: workIds } },
      select: { workId: true, person: { select: { name: true } } },
    });
    const byWork = new Map<string, string[]>();
    for (const c of creators) {
      const list = byWork.get(c.workId) ?? [];
      list.push(c.person.name);
      byWork.set(c.workId, list);
    }

    for (const row of rows) {
      const list = out.get(row.key) ?? [];
      list.push({
        id: row.id,
        type: row.type,
        titleFr: row.titleFr,
        titleNormalized: row.titleNormalized,
        year: row.year,
        isbn: row.isbn,
        coverImageId: row.coverImageId,
        creators: byWork.get(row.id) ?? [],
        sim: Number(row.sim),
      });
      out.set(row.key, list);
    }
  }

  return out;
}
