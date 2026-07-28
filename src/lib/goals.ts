/**
 * Objectifs annuels (lot 3, L5, D12) — logique pure.
 *
 * Un objectif porte sur une **portée** plutôt que sur un type d'œuvre : on se
 * fixe « 50 lectures », pas « 20 livres, 15 BD et 15 mangas ». `typesForScope`
 * est le seul endroit qui traduit une portée en types, et c'est ce qui permet
 * d'ajouter un média sans retoucher les requêtes.
 */

import type { GoalScope } from "@/generated/prisma/enums";
import type { WorkType } from "@/generated/prisma/enums";
import { MEDIA, MEDIA_ORDER, isReading } from "./media";

/** Ordre d'affichage : les portées transverses d'abord, puis les médias. */
export const GOAL_SCOPES: GoalScope[] = [
  "READINGS",
  "ALL",
  "FILM",
  "SERIES",
  "ANIME",
  "BOOK",
  "BD_SERIES",
  "MANGA_SERIES",
];

/** La portée activée par défaut (D12 : les lectures). */
export const DEFAULT_GOAL_SCOPE: GoalScope = "READINGS";

/** Cible maximale — un garde-fou de saisie, pas une limite de principe. */
export const MAX_GOAL_TARGET = 10_000;

/** Les types d'œuvres qu'une portée recouvre. */
export function typesForScope(scope: GoalScope): WorkType[] {
  if (scope === "ALL") return [...MEDIA_ORDER];
  if (scope === "READINGS") return MEDIA_ORDER.filter(isReading);
  return [scope];
}

export function scopeLabel(scope: GoalScope): string {
  if (scope === "ALL") return "Toutes œuvres";
  if (scope === "READINGS") return "Lectures";
  return MEDIA[scope].plural;
}

export function scopeEmoji(scope: GoalScope): string {
  if (scope === "ALL") return "✨";
  if (scope === "READINGS") return "📚";
  return MEDIA[scope].emoji;
}

export function isGoalScope(value: string): value is GoalScope {
  return (GOAL_SCOPES as string[]).includes(value);
}

export type GoalProgress = {
  /** 0 à 100, borné : dépasser son objectif ne casse pas la jauge. */
  percent: number;
  /** Ce qu'il reste à faire, jamais négatif. */
  remaining: number;
  reached: boolean;
};

/**
 * Progression vers un objectif. Une cible nulle ou négative est traitée comme
 * « pas d'objectif » : on ne divise pas par zéro pour afficher une jauge.
 */
export function goalProgress(done: number, target: number): GoalProgress {
  if (target <= 0) {
    return { percent: 0, remaining: 0, reached: false };
  }
  const percent = Math.min(100, Math.round((done / target) * 100));
  return {
    percent,
    remaining: Math.max(0, target - done),
    reached: done >= target,
  };
}

/**
 * Bornes d'une année civile, pour filtrer le journal. La borne haute est
 * exclusive : `loggedAt < end` évite les surprises du 31 décembre à 23 h 59.
 */
export function yearBounds(year: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year + 1, 0, 1)),
  };
}
