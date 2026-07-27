/**
 * Étiquettes libres (lot 3, S10) — logique pure.
 *
 * Un tag n'a qu'une identité réelle : son slug. « Science-Fiction », « science
 * fiction » et « SCIENCE-FICTION » désignent la même étiquette, et c'est le
 * premier libellé rencontré qui est conservé pour l'affichage. Le reste de
 * l'application ne manipule jamais autre chose que le couple (slug, name).
 */

import { slugify } from "./text";

/** Au-delà, la saisie relève de la faute de frappe plutôt que du classement. */
export const MAX_TAGS_PER_TARGET = 20;

/** Longueur maximale d'un libellé, alignée sur la colonne d'affichage. */
export const MAX_TAG_LENGTH = 50;

export type ParsedTag = { name: string; slug: string };

/**
 * Nettoie un libellé saisi : espaces compactés, longueur bornée. La casse et
 * les accents sont conservés — c'est le slug qui porte la comparaison.
 */
export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LENGTH);
}

/**
 * Découpe une saisie libre (« policier, années 70,  Policier ») en étiquettes
 * distinctes. Les doublons — à la casse, aux accents et à la ponctuation près —
 * sont fondus sur le premier libellé rencontré, et les entrées qui ne laissent
 * aucun slug (« !!! ») sont écartées silencieusement.
 */
export function parseTagInput(raw: string): ParsedTag[] {
  const out: ParsedTag[] = [];
  const seen = new Set<string>();

  for (const piece of raw.split(/[,\n]/)) {
    const name = normalizeTagName(piece);
    if (!name) continue;

    const slug = slugify(name);
    if (!slug || seen.has(slug)) continue;

    seen.add(slug);
    out.push({ name, slug });
    if (out.length === MAX_TAGS_PER_TARGET) break;
  }

  return out;
}

/** Rendu inverse : la liste d'étiquettes telle qu'on la remet dans le champ. */
export function formatTagInput(tags: { name: string }[]): string {
  return tags.map((t) => t.name).join(", ");
}
