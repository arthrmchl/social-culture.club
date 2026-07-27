// Fonctions pures de normalisation de texte.
// Utilisées pour la dédup, la recherche pg_trgm et les slugs de genres.

const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Normalise un titre pour la comparaison : minuscules, sans accents,
 * ponctuation réduite à des espaces, espaces compactés.
 * Ex. "L'Attaque des Titans !" -> "l attaque des titans"
 */
export function normalizeTitle(input: string): string {
  return input
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Slug URL-safe (pour les genres). */
export function slugify(input: string): string {
  return normalizeTitle(input).replace(/\s+/g, "-");
}
