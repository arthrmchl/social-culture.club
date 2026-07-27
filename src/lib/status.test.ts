import { describe, it, expect } from "vitest";
import { allowedStates, isStateAllowed, stateLabel } from "./status";

describe("allowedStates", () => {
  it("propose « à jour » uniquement pour séries et animés", () => {
    expect(allowedStates("SERIES")).toContain("CAUGHT_UP");
    expect(allowedStates("ANIME")).toContain("CAUGHT_UP");
    expect(allowedStates("FILM")).not.toContain("CAUGHT_UP");
    expect(allowedStates("BOOK")).not.toContain("CAUGHT_UP");
    expect(allowedStates("BD_SERIES")).not.toContain("CAUGHT_UP");
  });
  it("réduit les états d'un film", () => {
    expect(allowedStates("FILM")).toEqual(["WANT", "COMPLETED", "DROPPED"]);
  });
});

describe("isStateAllowed", () => {
  it("valide selon le média", () => {
    expect(isStateAllowed("SERIES", "CAUGHT_UP")).toBe(true);
    expect(isStateAllowed("FILM", "CAUGHT_UP")).toBe(false);
  });
});

describe("stateLabel", () => {
  it("adapte le libellé de WANT au média", () => {
    expect(stateLabel("FILM", "WANT")).toBe("À voir");
    expect(stateLabel("BOOK", "WANT")).toBe("Envie de lire");
    expect(stateLabel("BD_SERIES", "WANT")).toBe("À lire");
  });
  it("accorde terminé/abandonné au féminin pour les séries", () => {
    expect(stateLabel("SERIES", "COMPLETED")).toBe("Terminée");
    expect(stateLabel("SERIES", "DROPPED")).toBe("Abandonnée");
    expect(stateLabel("BOOK", "COMPLETED")).toBe("Terminé");
    expect(stateLabel("BOOK", "DROPPED")).toBe("Abandonné");
  });
});
