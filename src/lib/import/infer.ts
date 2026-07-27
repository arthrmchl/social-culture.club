/**
 * Inférences faites sur un titre importé (lot 2) — logique pure.
 *
 * Sans référentiel externe (D6), on ne dispose que de ce que la source écrit.
 * Ces heuristiques restent volontairement prudentes : elles proposent, et
 * l'écran de rapprochement permet toujours de corriger le type d'une cible.
 */

import type { WorkType } from "@/generated/prisma/enums";

export type DetectedVolume = {
  /** Titre débarrassé de la mention de tome. */
  title: string;
  /** Numéro de tome détecté, sinon null. */
  volume: number | null;
};

/**
 * Repère « Berserk, Vol. 12 », « Naruto tome 3 », « Sandman #4 ».
 * Le titre nettoyé sert de titre de série, le numéro devient un tome (L4).
 */
export function detectVolume(rawTitle: string): DetectedVolume {
  const title = rawTitle.trim();

  const patterns: RegExp[] = [
    /^(.*?)[\s,;:–—-]*\bvol(?:ume)?\.?\s*(\d{1,3})\b.*$/i,
    /^(.*?)[\s,;:–—-]*\btomes?\.?\s*(\d{1,3})\b.*$/i,
    /^(.*?)[\s,;:–—-]*\bt\.\s*(\d{1,3})\b.*$/i,
    /^(.*?)[\s,;:–—-]*#\s*(\d{1,3})\b.*$/,
  ];

  for (const re of patterns) {
    const m = re.exec(title);
    if (!m) continue;
    const base = m[1].replace(/[\s,;:–—-]+$/, "").trim();
    const volume = Number.parseInt(m[2], 10);
    // Un titre réduit à néant signifie qu'on a mal découpé : on renonce.
    if (!base || !Number.isFinite(volume) || volume <= 0) continue;
    return { title: base, volume };
  }

  return { title, volume: null };
}

/**
 * Type d'une lecture importée. Un tome détecté fait une série de mangas —
 * le média le plus fréquent dans ce cas ; l'utilisateur retype si besoin.
 */
export function inferReadingType(volume: number | null): WorkType {
  return volume === null ? "BOOK" : "MANGA_SERIES";
}

/** État de lecture Goodreads / literal.club → statut interne (L1, S8). */
export function inferReadingState(
  shelf: string,
): "COMPLETED" | "IN_PROGRESS" | "WANT" | null {
  const s = shelf.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (s === "read" || s === "finished") return "COMPLETED";
  if (s === "currently-reading" || s === "is-reading" || s === "reading") {
    return "IN_PROGRESS";
  }
  if (s === "to-read" || s === "want-to-read" || s === "wants-to-read") {
    return "WANT";
  }
  return null;
}

/** « https://letterboxd.com/film/dune-2021/ » → « letterboxd:dune-2021 ». */
export function letterboxdSlug(uri: string): string | null {
  const m = /letterboxd\.com\/film\/([^/?#]+)/i.exec(uri.trim());
  return m ? `letterboxd:${m[1].toLowerCase()}` : null;
}
