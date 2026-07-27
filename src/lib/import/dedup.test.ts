import { describe, it, expect } from "vitest";
import { buildImportKey, workKey, assignImportKeys } from "./dedup";
import { emptyEvent, emptyWorkRef, type ImportedEvent } from "./types";

function log(seed: string, file: string, line: number): ImportedEvent {
  const e = emptyEvent("LOG", emptyWorkRef("FILM", "Dune"), file, line);
  e.seed = seed;
  return e;
}

describe("buildImportKey", () => {
  it("est stable pour les mêmes entrées", () => {
    expect(buildImportKey("LETTERBOXD", "LOG", "a")).toBe(
      buildImportKey("LETTERBOXD", "LOG", "a"),
    );
  });

  it("distingue la source, la nature et la graine", () => {
    const a = buildImportKey("LETTERBOXD", "LOG", "x");
    expect(a).not.toBe(buildImportKey("GOODREADS", "LOG", "x"));
    expect(a).not.toBe(buildImportKey("LETTERBOXD", "RATING", "x"));
    expect(a).not.toBe(buildImportKey("LETTERBOXD", "LOG", "y"));
  });
});

describe("workKey", () => {
  it("privilégie l'identifiant de la source", () => {
    const ref = { ...emptyWorkRef("FILM", "Dune"), externalId: "letterboxd:dune" };
    expect(workKey(ref)).toBe("letterboxd:dune");
  });

  it("retombe sur type + titre normalisé + année", () => {
    const ref = { ...emptyWorkRef("FILM", "Le Voyage de Chihiro"), year: 2001 };
    expect(workKey(ref)).toBe("FILM|le voyage de chihiro|2001");
  });

  it("regroupe deux graphies du même titre", () => {
    const a = { ...emptyWorkRef("FILM", "L'Attaque des Titans !"), year: 2013 };
    const b = { ...emptyWorkRef("FILM", "l attaque des titans"), year: 2013 };
    expect(workKey(a)).toBe(workKey(b));
  });

  it("marque une année inconnue sans confondre avec l'année 0", () => {
    expect(workKey(emptyWorkRef("BOOK", "Dune"))).toBe("BOOK|dune|?");
  });
});

describe("assignImportKeys", () => {
  it("donne des clés distinctes à deux visionnages du même jour", () => {
    const events = [log("dune|2026-03-14", "diary.csv", 2), log("dune|2026-03-14", "diary.csv", 3)];
    const keys = assignImportKeys("LETTERBOXD", events).map((r) => r.importKey);
    expect(new Set(keys).size).toBe(2);
  });

  it("ne dépend pas de l'ordre de lecture des fichiers", () => {
    const a = log("dune|2026-03-14", "diary.csv", 2);
    const b = log("dune|2026-03-15", "diary.csv", 3);

    const ordre1 = assignImportKeys("LETTERBOXD", [a, b]);
    const ordre2 = assignImportKeys("LETTERBOXD", [b, a]);

    expect(ordre1.map((r) => r.importKey).sort()).toEqual(
      ordre2.map((r) => r.importKey).sort(),
    );
  });

  it("attribue la même clé au même événement d'un import à l'autre", () => {
    const premier = assignImportKeys("LETTERBOXD", [
      log("dune|2026-03-14", "diary.csv", 2),
    ]);
    const second = assignImportKeys("LETTERBOXD", [
      log("dune|2026-03-14", "diary.csv", 2),
    ]);
    expect(premier[0].importKey).toBe(second[0].importKey);
  });

  it("conserve la clé d'un événement quand un autre s'ajoute au lot", () => {
    const vu = log("dune|2026-03-14", "diary.csv", 2);
    const seul = assignImportKeys("LETTERBOXD", [vu])[0].importKey;

    const avecUnAutre = assignImportKeys("LETTERBOXD", [
      vu,
      log("arrival|2026-03-15", "diary.csv", 3),
    ]);
    const retrouve = avecUnAutre.find((r) => r.event.seed === "dune|2026-03-14");
    expect(retrouve?.importKey).toBe(seul);
  });

  it("rend une clé par événement", () => {
    const result = assignImportKeys("LETTERBOXD", [
      log("a", "diary.csv", 2),
      log("b", "diary.csv", 3),
      log("c", "watched.csv", 2),
    ]);
    expect(result).toHaveLength(3);
  });
});
