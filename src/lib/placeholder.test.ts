import { describe, it, expect } from "vitest";
import { initialsFor, hueFor, placeholderStyle } from "./placeholder";

describe("initialsFor", () => {
  it("ignore les articles pour garder les mots porteurs", () => {
    expect(initialsFor("Le Voyage de Chihiro")).toBe("VC");
    expect(initialsFor("The Lord of the Rings")).toBe("LR");
  });

  it("gère un titre d'un seul mot", () => {
    expect(initialsFor("Dune")).toBe("D");
  });

  it("ignore accents et ponctuation", () => {
    expect(initialsFor("L'Attaque des Titans !")).toBe("AT");
  });

  it("ne rend jamais une chaîne vide", () => {
    expect(initialsFor("")).toBe("?");
    expect(initialsFor("!!!")).toBe("?");
  });

  it("retombe sur les articles si le titre n'a que ça", () => {
    expect(initialsFor("Les")).toBe("L");
  });
});

describe("hueFor", () => {
  it("est déterministe", () => {
    expect(hueFor("Dune")).toBe(hueFor("Dune"));
  });

  it("reste dans l'intervalle des teintes", () => {
    for (const t of ["Dune", "Akira", "Piranesi", "", "Le Voyage de Chihiro"]) {
      const h = hueFor(t);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });

  it("distingue deux titres différents", () => {
    expect(hueFor("Dune")).not.toBe(hueFor("Akira"));
  });

  it("donne la même teinte à deux graphies du même titre", () => {
    expect(hueFor("L'Attaque des Titans !")).toBe(hueFor("l attaque des titans"));
  });
});

describe("placeholderStyle", () => {
  it("réunit initiales et teinte", () => {
    expect(placeholderStyle("Dune")).toEqual({
      initials: "D",
      hue: hueFor("Dune"),
    });
  });
});
