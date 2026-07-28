"use server";

import { requireUser } from "@/lib/session";
import { searchWorks } from "@/lib/search";
import { resolveCovers } from "@/lib/cover-loader";
import type { WorkType } from "@/generated/prisma/enums";

export type PickerResult = {
  id: string;
  type: WorkType;
  titleFr: string;
  year: number | null;
  coverImageId: string | null;
};

/**
 * Recherche d'œuvre pour les sélecteurs du lot 3 (ajout à une liste, choix
 * d'un favori).
 *
 * S'appuie sur la recherche floue existante (S1) plutôt que d'en réinventer
 * une : `searchCatalogue` (`import-search.ts`) fait déjà le même appel, mais
 * rend un `ImportCandidate` taillé pour l'écran de rapprochement.
 */
export async function searchForPicker(
  query: string,
  type?: WorkType,
): Promise<PickerResult[]> {
  const user = await requireUser();
  const q = query.trim();
  if (q.length < 2) return [];

  const results = (await searchWorks(q, type)).slice(0, 10);
  const covers = await resolveCovers(results, user.id);

  return results.map((r) => ({
    id: r.id,
    type: r.type,
    titleFr: r.titleFr,
    year: r.year,
    coverImageId: covers.get(r.id),
  }));
}
