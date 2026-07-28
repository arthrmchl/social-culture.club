/**
 * Quelle couverture afficher (lot 5) — logique pure.
 *
 * Un livre, une BD ou un manga n'a pas de couverture : ce sont ses éditions qui
 * en ont une. La cascade est donc **mon édition → l'édition par défaut → rien**,
 * et « rien » veut dire vignette générée (`CoverPlaceholder`), jamais un trou.
 *
 * Les autres médias gardent la leur sur la fiche : c'est `worksOwnCover` qui
 * tranche, et lui seul.
 */

import { pickDefaultEdition, type EditionLike } from "./editions";
import { worksOwnCover } from "./media";
import type { WorkType } from "@/generated/prisma/enums";

export type CoverWork = {
  type: WorkType;
  coverImageId?: string | null;
};

export type CoverEdition = EditionLike & {
  id: string;
  coverImageId?: string | null;
};

/**
 * L'identifiant de visuel à afficher, ou `null` s'il n'y en a aucun.
 *
 * Une édition sans visuel n'interrompt pas la cascade : lire le poche non
 * illustré ne doit pas effacer la couverture par défaut de la fiche.
 */
export function pickCoverImageId(
  work: CoverWork,
  editions: CoverEdition[],
  myEditionId?: string | null,
): string | null {
  if (worksOwnCover(work.type)) return work.coverImageId ?? null;

  const mine = myEditionId
    ? editions.find((e) => e.id === myEditionId)
    : undefined;
  if (mine?.coverImageId) return mine.coverImageId;

  return pickDefaultEdition(editions)?.coverImageId ?? null;
}
