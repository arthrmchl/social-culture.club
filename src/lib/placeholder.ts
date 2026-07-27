/**
 * Visuel de substitution des fiches importées (lot 2, I1) — logique pure.
 *
 * L'obligation de visuel (D31) ne vaut que pour la création manuelle : une
 * fiche importée arrive sans affiche. Plutôt qu'un trou dans la grille, on
 * dessine un carton déterministe — mêmes initiales et même couleur d'une
 * session à l'autre, ce qui rend une fiche reconnaissable avant même d'être
 * complétée.
 */

import { normalizeTitle } from "@/lib/text";

export type PlaceholderStyle = { initials: string; hue: number };

/**
 * Une ou deux initiales : les premières lettres des deux premiers mots
 * significatifs. « Le Voyage de Chihiro » → « VC ».
 */
export function initialsFor(title: string): string {
  const words = normalizeTitle(title)
    .split(" ")
    .filter((w) => w.length > 0 && !ARTICLES.has(w));

  const source = words.length > 0 ? words : normalizeTitle(title).split(" ");
  const letters = source
    .slice(0, 2)
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .toUpperCase();

  return letters || "?";
}

/** Teinte stable dérivée du titre (FNV-1a) — jamais aléatoire. */
export function hueFor(title: string): number {
  const key = normalizeTitle(title) || title;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 360;
}

export function placeholderStyle(title: string): PlaceholderStyle {
  return { initials: initialsFor(title), hue: hueFor(title) };
}

/** Articles et particules ignorés pour les initiales, français et anglais. */
const ARTICLES = new Set([
  "le",
  "la",
  "les",
  "l",
  "un",
  "une",
  "des",
  "du",
  "de",
  "d",
  "the",
  "a",
  "an",
  "of",
]);
