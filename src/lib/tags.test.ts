import { describe, it, expect } from "vitest";
import {
  MAX_TAGS_PER_TARGET,
  MAX_TAG_LENGTH,
  formatTagInput,
  normalizeTagName,
  parseTagInput,
} from "./tags";

describe("normalizeTagName", () => {
  it("compacte les espaces sans toucher à la casse ni aux accents", () => {
    expect(normalizeTagName("  Science   Fiction  ")).toBe("Science Fiction");
    expect(normalizeTagName("Années 70")).toBe("Années 70");
  });

  it("borne la longueur", () => {
    expect(normalizeTagName("a".repeat(200))).toHaveLength(MAX_TAG_LENGTH);
  });
});

describe("parseTagInput", () => {
  it("découpe sur les virgules et les sauts de ligne", () => {
    expect(parseTagInput("policier, années 70\nnoir")).toEqual([
      { name: "policier", slug: "policier" },
      { name: "années 70", slug: "annees-70" },
      { name: "noir", slug: "noir" },
    ]);
  });

  it("fond les doublons sur le premier libellé rencontré", () => {
    // Casse, accents et ponctuation ne distinguent pas deux étiquettes.
    const tags = parseTagInput(
      "Science-Fiction, science fiction, SCIENCE  FICTION",
    );
    expect(tags).toHaveLength(1);
    expect(tags[0]).toEqual({
      name: "Science-Fiction",
      slug: "science-fiction",
    });
  });

  it("écarte les entrées vides ou sans slug", () => {
    expect(parseTagInput("")).toEqual([]);
    expect(parseTagInput(" , ,, ")).toEqual([]);
    expect(parseTagInput("!!!, ???")).toEqual([]);
  });

  it("tronque au plafond sans lever", () => {
    const raw = Array.from({ length: 40 }, (_, i) => `tag${i}`).join(",");
    expect(parseTagInput(raw)).toHaveLength(MAX_TAGS_PER_TARGET);
  });
});

describe("formatTagInput", () => {
  it("fait l'aller-retour avec parseTagInput", () => {
    const tags = parseTagInput("policier, années 70");
    expect(parseTagInput(formatTagInput(tags))).toEqual(tags);
  });
});
