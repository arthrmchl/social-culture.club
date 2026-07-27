import { describe, it, expect } from "vitest";
import {
  detectVolume,
  inferReadingType,
  inferReadingState,
  letterboxdSlug,
} from "./infer";

describe("detectVolume", () => {
  it("reconnaît le format Goodreads « , Vol. N »", () => {
    expect(detectVolume("Berserk, Vol. 12")).toEqual({
      title: "Berserk",
      volume: 12,
    });
  });

  it("reconnaît « tome N » en français", () => {
    expect(detectVolume("Naruto tome 3")).toEqual({ title: "Naruto", volume: 3 });
  });

  it("reconnaît « T. N » et « #N »", () => {
    expect(detectVolume("Blame! T. 6")).toEqual({ title: "Blame!", volume: 6 });
    expect(detectVolume("Sandman #4")).toEqual({ title: "Sandman", volume: 4 });
  });

  it("ignore le sous-titre qui suit le numéro", () => {
    expect(detectVolume("Monster, Vol. 2: Surprise Party")).toEqual({
      title: "Monster",
      volume: 2,
    });
  });

  it("laisse intact un titre sans tome", () => {
    expect(detectVolume("Dune")).toEqual({ title: "Dune", volume: null });
  });

  it("ne découpe pas un titre qui commence par le motif", () => {
    expect(detectVolume("Vol. 714 pour Sydney").volume).toBeNull();
  });

  it("nettoie les espaces autour du titre", () => {
    expect(detectVolume("  Akira , Vol. 1  ").title).toBe("Akira");
  });
});

describe("inferReadingType", () => {
  it("fait un livre sans tome et une série de mangas avec", () => {
    expect(inferReadingType(null)).toBe("BOOK");
    expect(inferReadingType(3)).toBe("MANGA_SERIES");
  });
});

describe("inferReadingState", () => {
  it("traduit les étagères Goodreads", () => {
    expect(inferReadingState("read")).toBe("COMPLETED");
    expect(inferReadingState("currently-reading")).toBe("IN_PROGRESS");
    expect(inferReadingState("to-read")).toBe("WANT");
  });

  it("traduit les états literal.club", () => {
    expect(inferReadingState("FINISHED")).toBe("COMPLETED");
    expect(inferReadingState("IS_READING")).toBe("IN_PROGRESS");
    expect(inferReadingState("WANT_TO_READ")).toBe("WANT");
  });

  it("rend null pour une étagère personnalisée", () => {
    expect(inferReadingState("à-relire")).toBeNull();
    expect(inferReadingState("")).toBeNull();
  });
});

describe("letterboxdSlug", () => {
  it("extrait l'identifiant du film", () => {
    expect(letterboxdSlug("https://letterboxd.com/film/dune-2021/")).toBe(
      "letterboxd:dune-2021",
    );
  });

  it("rend null pour une URL étrangère", () => {
    expect(letterboxdSlug("https://example.com/x")).toBeNull();
    expect(letterboxdSlug("")).toBeNull();
  });
});
