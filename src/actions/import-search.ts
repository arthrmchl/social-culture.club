"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { searchWorks } from "@/lib/search";
import type { ImportCandidate } from "@/lib/import/match";

/**
 * Recherche libre dans le catalogue depuis l'écran de rapprochement (I6),
 * quand aucun candidat proposé ne convient. S'appuie sur la recherche floue
 * existante (S1) plutôt que d'en réinventer une.
 */
export async function searchCatalogue(
  query: string,
): Promise<ImportCandidate[]> {
  await requireUser();
  const q = query.trim();
  if (q.length < 2) return [];

  const results = (await searchWorks(q)).slice(0, 10);
  if (results.length === 0) return [];

  const creators = await db.workCreator.findMany({
    where: { workId: { in: results.map((r) => r.id) } },
    select: { workId: true, person: { select: { name: true } } },
  });
  const byWork = new Map<string, string[]>();
  for (const c of creators) {
    const list = byWork.get(c.workId) ?? [];
    list.push(c.person.name);
    byWork.set(c.workId, list);
  }

  return results.map((r) => ({
    id: r.id,
    type: r.type,
    titleFr: r.titleFr,
    titleNormalized: r.titleFr,
    year: r.year,
    isbn: null,
    coverImageId: r.coverImageId,
    creators: byWork.get(r.id) ?? [],
    sim: r.sim,
  }));
}
