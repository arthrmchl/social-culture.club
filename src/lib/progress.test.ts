import { describe, it, expect } from "vitest";
import {
  computeSeriesAutoState,
  computeTomesAutoState,
  parseEpisodeCode,
  episodesUpTo,
  formatTomeProgress,
  type EpisodeRef,
} from "./progress";

describe("computeSeriesAutoState", () => {
  it("passe à « à jour » quand tous les épisodes sont vus", () => {
    expect(computeSeriesAutoState(12, 12)).toBe("CAUGHT_UP");
  });
  it("est « en cours » quand la progression est partielle", () => {
    expect(computeSeriesAutoState(3, 12)).toBe("IN_PROGRESS");
  });
  it("ne suggère rien sans progression ni total", () => {
    expect(computeSeriesAutoState(0, 12)).toBeNull();
    expect(computeSeriesAutoState(0, 0)).toBeNull();
  });
});

describe("computeTomesAutoState", () => {
  it("passe à « terminé » quand tous les tomes sont lus", () => {
    expect(computeTomesAutoState(23, 23)).toBe("COMPLETED");
  });
  it("est « en cours » en cours de lecture", () => {
    expect(computeTomesAutoState(12, 23)).toBe("IN_PROGRESS");
  });
  it("ne suggère rien sans lecture", () => {
    expect(computeTomesAutoState(0, 23)).toBeNull();
  });
});

describe("parseEpisodeCode", () => {
  it("lit S03E07 sous plusieurs formes", () => {
    expect(parseEpisodeCode("S03E07")).toEqual({ season: 3, episode: 7 });
    expect(parseEpisodeCode("s3 e7")).toEqual({ season: 3, episode: 7 });
    expect(parseEpisodeCode("  S12·E24 ")).toEqual({ season: 12, episode: 24 });
  });
  it("renvoie null si illisible", () => {
    expect(parseEpisodeCode("épisode 7")).toBeNull();
    expect(parseEpisodeCode("")).toBeNull();
  });
});

describe("episodesUpTo", () => {
  const eps: EpisodeRef[] = [
    { id: "a", seasonNumber: 1, episodeNumber: 1 },
    { id: "b", seasonNumber: 1, episodeNumber: 2 },
    { id: "c", seasonNumber: 2, episodeNumber: 1 },
    { id: "d", seasonNumber: 2, episodeNumber: 2 },
    { id: "e", seasonNumber: 3, episodeNumber: 1 },
  ];
  it("inclut tout jusqu'à la cible (saisons antérieures comprises)", () => {
    expect(episodesUpTo(eps, { season: 2, episode: 1 })).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
  it("inclut toute une saison précédente", () => {
    expect(episodesUpTo(eps, { season: 3, episode: 1 })).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });
});

describe("formatTomeProgress", () => {
  it("accorde le pluriel sur le nombre de tomes lus", () => {
    expect(formatTomeProgress(12, 23)).toBe("12/23 tomes lus");
    expect(formatTomeProgress(1, 1)).toBe("1/1 tome lu");
    expect(formatTomeProgress(0, 5)).toBe("0/5 tome lu");
  });
});
