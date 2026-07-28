import { describe, it, expect } from "vitest";
import { LANGUAGES, languageLabel, normalizeLanguage } from "./languages";

describe("normalizeLanguage", () => {
  it("accepte le code comme le libellé", () => {
    expect(normalizeLanguage("fr")).toBe("fr");
    expect(normalizeLanguage(" FR ")).toBe("fr");
    expect(normalizeLanguage("Français")).toBe("fr");
    expect(normalizeLanguage("japonais")).toBe("ja");
  });

  it("conserve une langue inconnue plutôt que de la perdre", () => {
    expect(normalizeLanguage("Occitan")).toBe("occitan");
  });

  it("ramène le vide à null", () => {
    expect(normalizeLanguage("")).toBeNull();
    expect(normalizeLanguage("   ")).toBeNull();
    expect(normalizeLanguage(null)).toBeNull();
    expect(normalizeLanguage(undefined)).toBeNull();
  });
});

describe("languageLabel", () => {
  it("affiche le libellé français d'un code connu", () => {
    expect(languageLabel("ja")).toBe("Japonais");
    expect(languageLabel("Anglais")).toBe("Anglais");
  });

  it("affiche le code inconnu tel quel, jamais un trou", () => {
    expect(languageLabel("occitan")).toBe("occitan");
  });

  it("renvoie null quand rien n'est renseigné", () => {
    expect(languageLabel(null)).toBeNull();
    expect(languageLabel(" ")).toBeNull();
  });
});

describe("LANGUAGES", () => {
  it("ne déclare pas deux fois le même code", () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
