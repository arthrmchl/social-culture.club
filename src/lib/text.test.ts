import { describe, it, expect } from "vitest";
import { normalizeTitle, slugify } from "./text";

describe("normalizeTitle", () => {
  it("passe en minuscules et retire les accents", () => {
    expect(normalizeTitle("Amélie Poulain")).toBe("amelie poulain");
  });

  it("réduit la ponctuation et compacte les espaces", () => {
    expect(normalizeTitle("L'Attaque des Titans !")).toBe(
      "l attaque des titans",
    );
  });

  it("rapproche les variantes de casse/accents pour la dédup", () => {
    expect(normalizeTitle("Spirited Away")).toBe(
      normalizeTitle("spirited  away"),
    );
    expect(normalizeTitle("Æon")).not.toBe(""); // ne casse pas sur caractères rares
  });

  it("renvoie une chaîne vide pour une entrée sans lettres", () => {
    expect(normalizeTitle("!!! ??? ...")).toBe("");
  });
});

describe("slugify", () => {
  it("produit un slug URL-safe", () => {
    expect(slugify("Science-fiction")).toBe("science-fiction");
    expect(slugify("Slice of life")).toBe("slice-of-life");
  });
});
