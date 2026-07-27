// Générateurs de sous-unités en masse (S2) — logique pure, testable.

/** Renvoie [start, start+1, …] de longueur `count`. */
export function buildRange(count: number, start = 1): number[] {
  const n = Math.max(0, Math.floor(count));
  return Array.from({ length: n }, (_, i) => start + i);
}

export type GeneratedEpisode = { number: number; title: string | null };
export type GeneratedSeason = {
  number: number;
  title: string | null;
  episodes: GeneratedEpisode[];
};

/** « série de S saisons de E épisodes ». */
export function buildSeasons(
  seasonsCount: number,
  episodesPerSeason: number,
): GeneratedSeason[] {
  return buildRange(seasonsCount).map((s) => ({
    number: s,
    title: null,
    episodes: buildRange(episodesPerSeason).map((e) => ({
      number: e,
      title: null,
    })),
  }));
}

export type GeneratedTome = { number: number; title: string | null };

/** « série de N tomes ». */
export function buildTomes(count: number, start = 1): GeneratedTome[] {
  return buildRange(count, start).map((n) => ({ number: n, title: null }));
}
