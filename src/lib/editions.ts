/**
 * Éditions (lot 3, L6, D8) — logique pure.
 *
 * Le modèle `Edition` existe depuis le lot 0 ; ce fichier lui donne ses règles.
 * Depuis le lot 6, l'édition porte aussi ses **tomes** : une intégrale n'est
 * plus une étendue déclarée sur la série, c'est une édition qui a peu de
 * volumes.
 */

import { languageLabel } from "./languages";

/** La forme minimale attendue — un sous-ensemble du modèle Prisma. */
export type EditionLike = {
  title?: string | null;
  language?: string | null;
  publisher?: string | null;
  format?: string | null;
  pageCount?: number | null;
  isbn?: string | null;
  isDefault?: boolean;
};

/**
 * Libellé d'une édition — son titre s'il diffère, puis éditeur, format, langue,
 * pagination et nombre de tomes, puis l'ISBN en dernier recours. Une édition
 * dont rien n'est renseigné reste nommable : la création n'exige que son
 * existence (D8).
 */
export function editionLabel(edition: EditionLike, tomeCount = 0): string {
  const parts: string[] = [];
  if (edition.title?.trim()) parts.push(edition.title.trim());
  if (edition.publisher?.trim()) parts.push(edition.publisher.trim());
  if (edition.format?.trim()) parts.push(edition.format.trim());
  const language = languageLabel(edition.language);
  if (language) parts.push(language);
  if (edition.pageCount) parts.push(`${edition.pageCount} pages`);
  if (tomeCount > 0) {
    parts.push(`${tomeCount} tome${tomeCount > 1 ? "s" : ""}`);
  }

  if (parts.length > 0) return parts.join(" · ");
  if (edition.isbn?.trim()) return `ISBN ${edition.isbn.trim()}`;
  return "Édition sans détail";
}

/**
 * L'édition à retenir par défaut : celle marquée comme telle, sinon la
 * première de la liste. Renvoie `null` sur une liste vide plutôt que de forcer
 * l'appelant à la tester deux fois.
 */
export function pickDefaultEdition<T extends EditionLike>(
  editions: T[],
): T | null {
  return editions.find((e) => e.isDefault) ?? editions[0] ?? null;
}

/**
 * Pagination de référence : celle de l'édition que je lis, sinon celle de
 * l'édition par défaut. Une œuvre n'a plus de pagination propre (lot 5) — c'est
 * ce qui permet à « page 210 sur 380 » d'être juste quand on lit le poche
 * plutôt que le broché, et de rester vide tant qu'aucune édition n'est décrite
 * (le suivi retombe alors sur le pourcentage).
 */
export function pageCountFor<T extends EditionLike & { id: string }>(
  editions: T[],
  myEditionId: string | null | undefined,
): number | null {
  const mine = myEditionId
    ? (editions.find((e) => e.id === myEditionId) ?? null)
    : null;
  return (mine ?? pickDefaultEdition(editions))?.pageCount ?? null;
}
