import { describe, it, expect } from "vitest";
import {
  starsToScore,
  scoreToStars,
  formatStars,
  starParts,
} from "./rating";

describe("starsToScore", () => {
  it("convertit les demi-étoiles en score sur 10", () => {
    expect(starsToScore(0.5)).toBe(1);
    expect(starsToScore(2.5)).toBe(5);
    expect(starsToScore(5)).toBe(10);
  });
  it("borne les valeurs hors échelle", () => {
    expect(starsToScore(0)).toBe(1);
    expect(starsToScore(7)).toBe(10);
  });
});

describe("scoreToStars", () => {
  it("est l'inverse de starsToScore", () => {
    for (let s = 1; s <= 10; s++) {
      expect(starsToScore(scoreToStars(s))).toBe(s);
    }
  });
  it("borne à 0,5..5", () => {
    expect(scoreToStars(0)).toBe(0.5);
    expect(scoreToStars(99)).toBe(5);
  });
});

describe("formatStars", () => {
  it("formate à la française", () => {
    expect(formatStars(7)).toBe("3,5");
    expect(formatStars(10)).toBe("5");
  });
  it("renvoie null sans note", () => {
    expect(formatStars(null)).toBeNull();
    expect(formatStars(undefined)).toBeNull();
  });
});

describe("starParts", () => {
  it("décompose 3,5 étoiles", () => {
    expect(starParts(7)).toEqual({ full: 3, half: true, empty: 1 });
  });
  it("décompose 5 étoiles pleines", () => {
    expect(starParts(10)).toEqual({ full: 5, half: false, empty: 0 });
  });
  it("décompose une demi-étoile", () => {
    expect(starParts(1)).toEqual({ full: 0, half: true, empty: 4 });
  });
});
