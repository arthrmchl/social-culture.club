/**
 * Éditions et intégrales (lot 3, L6, D8) — logique pure.
 *
 * Le modèle `Edition` existe depuis le lot 0 ; ce fichier lui donne enfin ses
 * règles. La plus importante : une **intégrale** déclare l'étendue de tomes
 * qu'elle couvre, et lire cette édition marque ces tomes comme lus.
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
  coversTomeFrom?: number | null;
  coversTomeTo?: number | null;
};

/**
 * Une édition qui couvre plusieurs tomes. Une borne seule suffit à la
 * déclarer : « intégrale à partir du tome 4 » reste une intention lisible,
 * même si la borne haute n'a pas été saisie.
 */
export function isOmnibus(edition: EditionLike): boolean {
  return edition.coversTomeFrom != null || edition.coversTomeTo != null;
}

/**
 * Les numéros de tomes couverts par une intégrale.
 *
 * Tolérant par construction : bornes inversées remises à l'endroit, borne
 * manquante ramenée à l'autre (une intégrale « tome 3 » couvre le seul tome 3),
 * numéros non entiers ou négatifs écartés. Une édition ordinaire ne couvre
 * rien — c'est le tome auquel elle est rattachée qui la porte.
 */
export function coveredTomeNumbers(edition: EditionLike): number[] {
  if (!isOmnibus(edition)) return [];

  const a = edition.coversTomeFrom ?? edition.coversTomeTo;
  const b = edition.coversTomeTo ?? edition.coversTomeFrom;
  if (a == null || b == null) return [];

  const from = Math.trunc(Math.min(a, b));
  const to = Math.trunc(Math.max(a, b));
  if (to < 1) return [];

  const out: number[] = [];
  for (let n = Math.max(1, from); n <= to; n++) out.push(n);
  return out;
}

/**
 * Libellé d'une édition — son titre s'il diffère, puis éditeur, format, langue
 * et pagination, puis l'ISBN en dernier recours. Une édition dont rien n'est
 * renseigné reste nommable : la création n'exige que son existence (D8).
 */
export function editionLabel(edition: EditionLike): string {
  const parts: string[] = [];
  if (edition.title?.trim()) parts.push(edition.title.trim());
  if (edition.publisher?.trim()) parts.push(edition.publisher.trim());
  if (edition.format?.trim()) parts.push(edition.format.trim());
  const language = languageLabel(edition.language);
  if (language) parts.push(language);
  if (edition.pageCount) parts.push(`${edition.pageCount} pages`);

  if (parts.length > 0) return parts.join(" · ");
  if (edition.isbn?.trim()) return `ISBN ${edition.isbn.trim()}`;
  return "Édition sans détail";
}

/** Description de l'étendue couverte, pour l'affichage. */
export function omnibusLabel(edition: EditionLike): string | null {
  const tomes = coveredTomeNumbers(edition);
  if (tomes.length === 0) return null;
  const first = tomes[0];
  const last = tomes[tomes.length - 1];
  return first === last ? `Tome ${first}` : `Tomes ${first} à ${last}`;
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
