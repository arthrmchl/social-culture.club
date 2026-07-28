/**
 * Rapprochement d'une œuvre importée avec le catalogue (lot 2, I6) — pur.
 *
 * L'enjeu : ne demander à l'utilisateur que ce qui est réellement ambigu.
 * Sur un premier import (catalogue vide) presque tout est « à créer » ; sur un
 * ré-import, presque tout se rattache tout seul — et c'est cette seconde
 * propriété, combinée à JournalEntry.importKey, qui rend les imports rejouables
 * sans duplication.
 */

import { normalizeTitle } from "@/lib/text";
import type { ImportResolution, WorkType } from "@/generated/prisma/enums";
import type { ImportedWorkRef } from "./types";

export type ImportCandidate = {
  id: string;
  type: WorkType;
  titleFr: string;
  titleNormalized: string;
  year: number | null;
  coverImageId: string | null;
  creators: string[];
  sim: number;
};

/** Au-dessus : rattachement automatique. */
export const AUTO_LINK_THRESHOLD = 0.9;
/** En dessous : création automatique. */
export const MANUAL_FLOOR = 0.55;
/** Deux candidats plus proches que cela l'un de l'autre : décision manuelle. */
export const AMBIGUITY_MARGIN = 0.05;

export type MatchDecision = {
  resolution: ImportResolution;
  workId: string | null;
  confidence: number;
  /** Faux quand la décision revient à l'utilisateur. */
  auto: boolean;
};

/**
 * Écart d'année toléré. Un film sort une fois ; un livre importé porte
 * souvent l'année de son édition de poche, à des décennies de l'originale.
 */
export function yearTolerance(type: WorkType): number {
  switch (type) {
    case "FILM":
    case "SERIES":
    case "ANIME":
      return 1;
    default:
      return 60;
  }
}

/** Score de 0 à 1 : titre (60 %), année (20 %), type (20 %), bonus auteur. */
export function scoreMatch(
  ref: ImportedWorkRef,
  candidate: ImportCandidate,
): number {
  const title = titleScore(ref, candidate);
  const year = yearScore(ref, candidate);
  const type = typeScore(ref.type, candidate.type);

  let score = 0.6 * title + 0.2 * year + 0.2 * type;

  if (creatorsOverlap(ref, candidate)) score += 0.1;

  // Arrondi indispensable : sans lui, un titre et un type identiques avec une
  // année inconnue donnent 0,8999999999999999 et ratent le seuil de 0,90 —
  // un cas évident renvoyé à l'utilisateur pour rien.
  return round(Math.min(Math.max(score, 0), 1));
}

function round(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function titleScore(ref: ImportedWorkRef, candidate: ImportCandidate): number {
  const a = normalizeTitle(ref.titleFr);
  const b = candidate.titleNormalized;
  if (a && a === b) return 1;
  return Math.min(Math.max(candidate.sim, 0), 1);
}

function yearScore(ref: ImportedWorkRef, candidate: ImportCandidate): number {
  // Une année inconnue n'est ni un indice pour, ni un indice contre.
  if (ref.year === null || candidate.year === null) return 0.5;

  const delta = Math.abs(ref.year - candidate.year);
  const tolerance = yearTolerance(ref.type);
  if (delta <= tolerance) return 1;

  // Décroissance linéaire au-delà de la tolérance, nulle au double.
  const excess = delta - tolerance;
  return Math.max(0, 1 - excess / tolerance);
}

function typeScore(a: WorkType, b: WorkType): number {
  if (a === b) return 1;
  const proches: WorkType[][] = [
    ["SERIES", "ANIME"],
    ["BD_SERIES", "MANGA_SERIES"],
  ];
  return proches.some((g) => g.includes(a) && g.includes(b)) ? 0.7 : 0;
}

function creatorsOverlap(
  ref: ImportedWorkRef,
  candidate: ImportCandidate,
): boolean {
  if (ref.creators.length === 0 || candidate.creators.length === 0) return false;
  const known = new Set(candidate.creators.map(normalizeTitle));
  return ref.creators.some((c) => known.has(normalizeTitle(c)));
}

/**
 * Tranche pour une cible : rattacher, créer, ou demander à l'utilisateur.
 * Les candidats sont supposés venir de la recherche trigramme ; l'ordre
 * d'entrée n'a pas d'importance.
 */
export function decideResolution(
  ref: ImportedWorkRef,
  candidates: ImportCandidate[],
): MatchDecision {
  if (candidates.length === 0) {
    return { resolution: "CREATE", workId: null, confidence: 0, auto: true };
  }

  const scored = candidates
    .map((c) => ({ candidate: c, score: scoreMatch(ref, c) }))
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));

  const best = scored[0];
  const second = scored[1];

  // Trop faible pour être le même titre : on crée la fiche.
  if (best.score < MANUAL_FLOOR) {
    return {
      resolution: "CREATE",
      workId: null,
      confidence: best.score,
      auto: true,
    };
  }

  const ambiguous =
    second !== undefined && best.score - second.score < AMBIGUITY_MARGIN;

  if (best.score >= AUTO_LINK_THRESHOLD && !ambiguous) {
    return {
      resolution: "LINK",
      workId: best.candidate.id,
      confidence: best.score,
      auto: true,
    };
  }

  // Zone grise : on propose le meilleur candidat, l'utilisateur tranche.
  return {
    resolution: "LINK",
    workId: best.candidate.id,
    confidence: best.score,
    auto: false,
  };
}
