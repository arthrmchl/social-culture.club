import { describe, it, expect } from "vitest";
import {
  GOAL_SCOPES,
  goalProgress,
  isGoalScope,
  scopeLabel,
  typesForScope,
  yearBounds,
} from "./goals";
import { MEDIA_ORDER } from "./media";

describe("typesForScope", () => {
  it("recouvre les trois lectures", () => {
    expect(typesForScope("READINGS")).toEqual([
      "BOOK",
      "BD_SERIES",
      "MANGA_SERIES",
    ]);
  });

  it("recouvre tous les médias pour la portée globale", () => {
    expect(typesForScope("ALL")).toEqual(MEDIA_ORDER);
  });

  it("se réduit au média nommé", () => {
    expect(typesForScope("FILM")).toEqual(["FILM"]);
  });

  it("ne laisse aucune portée sans types", () => {
    for (const scope of GOAL_SCOPES) {
      expect(typesForScope(scope).length).toBeGreaterThan(0);
    }
  });
});

describe("scopeLabel", () => {
  it("nomme les portées transverses et reprend le pluriel des médias", () => {
    expect(scopeLabel("READINGS")).toBe("Lectures");
    expect(scopeLabel("ALL")).toBe("Toutes œuvres");
    expect(scopeLabel("MANGA_SERIES")).toBe("Mangas");
  });
});

describe("isGoalScope", () => {
  it("reconnaît les portées et rejette le reste", () => {
    expect(isGoalScope("READINGS")).toBe(true);
    expect(isGoalScope("PODCAST")).toBe(false);
  });
});

describe("goalProgress", () => {
  it("calcule pourcentage et reste", () => {
    expect(goalProgress(15, 30)).toEqual({
      percent: 50,
      remaining: 15,
      reached: false,
    });
  });

  it("plafonne à 100 sans reste négatif quand l'objectif est dépassé", () => {
    expect(goalProgress(42, 30)).toEqual({
      percent: 100,
      remaining: 0,
      reached: true,
    });
  });

  it("considère l'objectif atteint à l'égalité", () => {
    expect(goalProgress(30, 30).reached).toBe(true);
  });

  it("ne divise pas par zéro", () => {
    expect(goalProgress(5, 0)).toEqual({
      percent: 0,
      remaining: 0,
      reached: false,
    });
    expect(goalProgress(5, -3).percent).toBe(0);
  });
});

describe("yearBounds", () => {
  it("borne l'année civile, borne haute exclue", () => {
    const { start, end } = yearBounds(2026);
    expect(start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    // Le 31 décembre à 23 h 59 tombe bien dans l'année.
    expect(new Date("2026-12-31T23:59:59Z") < end).toBe(true);
  });
});
