import { describe, it, expect } from "vitest";
import { groupIntoTargets, describeTarget } from "./merge";
import { letterboxdAdapter } from "./adapters/letterboxd";
import { goodreadsAdapter } from "./adapters/goodreads";
import { serializdAdapter } from "./adapters/serializd";
import { loadFixture } from "./fixtures";
import { DEFAULT_IMPORT_OPTIONS } from "./types";

const letterboxd = groupIntoTargets(
  "LETTERBOXD",
  letterboxdAdapter.parse(loadFixture("letterboxd"), DEFAULT_IMPORT_OPTIONS).events,
);
const goodreads = groupIntoTargets(
  "GOODREADS",
  goodreadsAdapter.parse(loadFixture("goodreads"), DEFAULT_IMPORT_OPTIONS).events,
);
const serializd = groupIntoTargets(
  "SERIALIZD",
  serializdAdapter.parse(loadFixture("serializd"), DEFAULT_IMPORT_OPTIONS).events,
);

const find = (targets: typeof letterboxd, title: string) =>
  targets.find((t) => t.ref.titleFr === title)!;

describe("regroupement en cibles", () => {
  it("ne fait qu'une cible d'un film vu, noté, aimé et critiqué", () => {
    const dune = find(letterboxd, "Dune");
    expect(dune.events.length).toBeGreaterThan(3);
    expect(letterboxd.filter((t) => t.ref.titleFr === "Dune")).toHaveLength(1);
  });

  it("compte une décision par œuvre, pas par ligne", () => {
    // 5 films distincts dans la fixture, quel que soit le nombre de lignes.
    expect(letterboxd).toHaveLength(5);
  });

  it("range les cibles par titre normalisé, de façon déterministe", () => {
    const titres = letterboxd.map((t) => t.titleNormalized);
    expect(titres).toEqual([...titres].sort());
  });

  it("attribue une clé d'import unique à chaque événement", () => {
    const keys = letterboxd.flatMap((t) => t.events.map((e) => e.importKey));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("produit exactement le même résultat d'une analyse à l'autre", () => {
    const encore = groupIntoTargets(
      "LETTERBOXD",
      letterboxdAdapter.parse(loadFixture("letterboxd"), DEFAULT_IMPORT_OPTIONS)
        .events,
    );
    expect(encore.map((t) => t.workKey)).toEqual(letterboxd.map((t) => t.workKey));
    expect(encore.flatMap((t) => t.events.map((e) => e.importKey))).toEqual(
      letterboxd.flatMap((t) => t.events.map((e) => e.importKey)),
    );
  });
});

describe("consolidation de la référence", () => {
  it("garde l'année et l'identifiant vus dans n'importe quel fichier", () => {
    const dune = find(letterboxd, "Dune");
    expect(dune.ref.year).toBe(2021);
    expect(dune.ref.externalId).toBe("letterboxd:dune-2021");
  });

  it("réunit les informations de fiche d'une lecture", () => {
    const dune = find(goodreads, "Dune");
    expect(dune.ref.isbn).toBe("9780441013593");
    expect(dune.ref.pageCount).toBe(896);
    expect(dune.ref.creators).toEqual(["Frank Herbert"]);
  });

  it("collecte les saisons rencontrées", () => {
    expect(find(serializd, "Severance").seasons).toEqual([1, 2]);
    expect(find(serializd, "Shogun").seasons).toEqual([1]);
  });

  it("collecte les tomes rencontrés", () => {
    expect(find(goodreads, "Berserk").volumes).toEqual([12]);
  });

  it("ne laisse pas de sous-unité sur la référence consolidée", () => {
    const severance = find(serializd, "Severance");
    expect(severance.ref.seasonNumber).toBeNull();
  });
});

describe("describeTarget", () => {
  it("résume une cible en français", () => {
    expect(describeTarget(find(letterboxd, "Dune"))).toContain("2 entrées");
    expect(describeTarget(find(serializd, "Severance"))).toContain("2 saisons");
  });

  it("accorde le singulier", () => {
    expect(describeTarget(find(serializd, "Shogun"))).toContain("1 entrée");
  });

  it("ne laisse jamais un résumé vide", () => {
    for (const t of [...letterboxd, ...goodreads, ...serializd]) {
      expect(describeTarget(t).length).toBeGreaterThan(0);
    }
  });
});
