/**
 * Résolution tolérante des colonnes (lot 2).
 *
 * C'est le point unique de correction quand un export tiers change de format :
 * chaque adaptateur déclare une table d'alias, personne ne code un nom de
 * colonne en dur ailleurs.
 */

import { normalizeTitle } from "@/lib/text";

export type ColumnAliases = Record<string, readonly string[]>;

/** Minuscules, sans accents, ponctuation et espaces compactés. */
export function normalizeHeader(h: string): string {
  return normalizeTitle(h);
}

/** Nom réel de la première colonne correspondant à un alias, sinon null. */
export function pickColumn(
  headers: string[],
  aliases: readonly string[],
): string | null {
  const wanted = aliases.map(normalizeHeader);
  for (const w of wanted) {
    const found = headers.find((h) => normalizeHeader(h) === w);
    if (found !== undefined) return found;
  }
  return null;
}

/**
 * Résout tout un plan de colonnes d'un coup et signale les obligatoires
 * absentes (l'appelant en fait un avertissement affiché à l'utilisateur).
 */
export function resolveColumns<A extends ColumnAliases>(
  headers: string[],
  aliases: A,
  required: readonly (keyof A)[] = [],
): { map: Record<keyof A, string | null>; missing: string[] } {
  const map = {} as Record<keyof A, string | null>;
  for (const key of Object.keys(aliases) as (keyof A)[]) {
    map[key] = pickColumn(headers, aliases[key]);
  }

  const missing = required
    .filter((key) => map[key] === null)
    .map((key) => String(key));

  return { map, missing };
}

/** Lit une cellule via le plan de colonnes résolu ; "" si la colonne est absente. */
export function cell<A extends ColumnAliases>(
  record: Record<string, string>,
  map: Record<keyof A, string | null>,
  key: keyof A,
): string {
  const column = map[key];
  if (column === null) return "";
  return (record[column] ?? "").trim();
}
