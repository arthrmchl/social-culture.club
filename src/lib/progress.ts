// Progression fine (T1 épisodes, L4 tomes) — logique pure, testable.
// Le passage automatique à « à jour » / « terminé » (T2) est *suggéré* ici ;
// les server actions décident de ne pas écraser un état manuel (en pause…).

import type { WorkStatusState } from "@/generated/prisma/enums";

/**
 * Auto-statut d'une série/animé selon les épisodes vus (T2).
 * Tous les épisodes existants vus → « à jour » (sans référentiel externe,
 * l'application ne connaît que les épisodes créés). Aucun épisode → null.
 */
export function computeSeriesAutoState(
  watched: number,
  total: number,
): Extract<WorkStatusState, "IN_PROGRESS" | "CAUGHT_UP"> | null {
  if (total <= 0 || watched <= 0) return null;
  return watched >= total ? "CAUGHT_UP" : "IN_PROGRESS";
}

/** Auto-statut d'une série BD/manga selon les tomes lus (L4). */
export function computeTomesAutoState(
  read: number,
  total: number,
): Extract<WorkStatusState, "IN_PROGRESS" | "COMPLETED"> | null {
  if (total <= 0 || read <= 0) return null;
  return read >= total ? "COMPLETED" : "IN_PROGRESS";
}

/** Parse un code d'épisode « S03E07 » (tolérant aux espaces et à la casse). */
export function parseEpisodeCode(
  input: string,
): { season: number; episode: number } | null {
  const m = /s\s*(\d+)\s*[·.\-\s]*e\s*(\d+)/i.exec(input.trim());
  if (!m) return null;
  return { season: Number(m[1]), episode: Number(m[2]) };
}

export type EpisodeRef = {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
};

/**
 * « Marquer comme vu jusqu'à SxxEyy » (T1) : renvoie les identifiants des
 * épisodes jusqu'à la cible incluse, selon l'ordre saison puis épisode.
 */
export function episodesUpTo(
  episodes: EpisodeRef[],
  target: { season: number; episode: number },
): string[] {
  return episodes
    .filter(
      (e) =>
        e.seasonNumber < target.season ||
        (e.seasonNumber === target.season && e.episodeNumber <= target.episode),
    )
    .map((e) => e.id);
}

/** Agrégat « 12/23 tomes lus » (L4). Accords selon le nombre de tomes lus. */
export function formatTomeProgress(read: number, total: number): string {
  const plural = read > 1 ? "s" : "";
  return `${read}/${total} tome${plural} lu${plural}`;
}
