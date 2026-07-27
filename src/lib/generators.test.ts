import { describe, it, expect } from "vitest";
import { buildRange, buildSeasons, buildTomes } from "./generators";

describe("buildRange", () => {
  it("génère une plage à partir de 1 par défaut", () => {
    expect(buildRange(3)).toEqual([1, 2, 3]);
  });
  it("respecte un début personnalisé", () => {
    expect(buildRange(3, 10)).toEqual([10, 11, 12]);
  });
  it("renvoie un tableau vide pour 0 ou négatif", () => {
    expect(buildRange(0)).toEqual([]);
    expect(buildRange(-5)).toEqual([]);
  });
});

describe("buildSeasons", () => {
  it("génère une saison de 12 épisodes", () => {
    const seasons = buildSeasons(1, 12);
    expect(seasons).toHaveLength(1);
    expect(seasons[0].number).toBe(1);
    expect(seasons[0].episodes).toHaveLength(12);
    expect(seasons[0].episodes.at(-1)?.number).toBe(12);
  });
  it("génère plusieurs saisons", () => {
    const seasons = buildSeasons(3, 24);
    expect(seasons.map((s) => s.number)).toEqual([1, 2, 3]);
    expect(seasons.every((s) => s.episodes.length === 24)).toBe(true);
  });
});

describe("buildTomes", () => {
  it("génère une série de 23 tomes numérotés", () => {
    const tomes = buildTomes(23);
    expect(tomes).toHaveLength(23);
    expect(tomes[0].number).toBe(1);
    expect(tomes.at(-1)?.number).toBe(23);
  });
});
