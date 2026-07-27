// Notation (D3/S5) : échelle unique d'affichage — 5 étoiles par demi-point —
// stockée en interne sur 10 (permet un changement d'échelle sans perte).
// Rien ne dépend d'un média : une seule échelle pour toutes les œuvres.

export const MIN_SCORE = 1; // 0,5 étoile
export const MAX_SCORE = 10; // 5 étoiles

/** Valeurs d'étoiles sélectionnables (0,5 à 5 par demi-point). */
export const STAR_STEPS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const;

/** Étoiles (0,5..5 par demi-point) → score entier 1..10. */
export function starsToScore(stars: number): number {
  const score = Math.round(stars * 2);
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, score));
}

/** Score interne 1..10 → étoiles 0,5..5. */
export function scoreToStars(score: number): number {
  const stars = Math.round(score) / 2;
  return Math.min(5, Math.max(0.5, stars));
}

/** Étoiles au format français, ex. score 7 → "3,5". `null` si pas de note. */
export function formatStars(score: number | null | undefined): string | null {
  if (score == null) return null;
  return scoreToStars(score).toString().replace(".", ",");
}

/** Décomposition d'un score en étoiles pleines / demi / vides (sur 5). */
export function starParts(score: number): {
  full: number;
  half: boolean;
  empty: number;
} {
  const stars = scoreToStars(score);
  const full = Math.floor(stars);
  const half = stars % 1 !== 0;
  const empty = 5 - full - (half ? 1 : 0);
  return { full, half, empty };
}
