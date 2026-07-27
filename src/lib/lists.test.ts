import { describe, it, expect } from "vitest";
import {
  compactPositions,
  describeList,
  nextPosition,
  reorderPositions,
} from "./lists";

const items = [
  { id: "a", position: 0 },
  { id: "b", position: 1 },
  { id: "c", position: 2 },
];

describe("nextPosition", () => {
  it("ajoute à la fin", () => {
    expect(nextPosition(items)).toBe(3);
  });

  it("part de zéro sur une liste vide", () => {
    expect(nextPosition([])).toBe(0);
  });

  it("ignore les trous laissés par une suppression", () => {
    expect(nextPosition([{ position: 0 }, { position: 7 }])).toBe(8);
  });
});

describe("reorderPositions", () => {
  it("ne renvoie que les lignes réellement déplacées", () => {
    // c passe en tête : a et b glissent d'un cran, c prend la place 0.
    expect(reorderPositions(items, "c", 0)).toEqual([
      { id: "c", position: 0 },
      { id: "a", position: 1 },
      { id: "b", position: 2 },
    ]);
  });

  it("n'écrit rien quand l'élément ne bouge pas", () => {
    expect(reorderPositions(items, "b", 1)).toEqual([]);
  });

  it("ramène un index hors bornes dans les bornes", () => {
    expect(reorderPositions(items, "a", 99)).toEqual([
      { id: "b", position: 0 },
      { id: "c", position: 1 },
      { id: "a", position: 2 },
    ]);
    expect(reorderPositions(items, "c", -5)).toEqual(
      reorderPositions(items, "c", 0),
    );
  });

  it("ignore un identifiant absent", () => {
    expect(reorderPositions(items, "zz", 0)).toEqual([]);
  });

  it("renumérote de façon contiguë malgré des positions éparses", () => {
    const sparse = [
      { id: "a", position: 5 },
      { id: "b", position: 12 },
    ];
    expect(reorderPositions(sparse, "b", 0)).toEqual([
      { id: "b", position: 0 },
      { id: "a", position: 1 },
    ]);
  });
});

describe("compactPositions", () => {
  it("comble les trous d'une suppression", () => {
    expect(
      compactPositions([
        { id: "a", position: 0 },
        { id: "c", position: 2 },
      ]),
    ).toEqual([{ id: "c", position: 1 }]);
  });

  it("ne touche pas une liste déjà compacte", () => {
    expect(compactPositions(items)).toEqual([]);
  });
});

describe("describeList", () => {
  it("accorde en français et signale le classement", () => {
    expect(describeList(0, false)).toBe("Vide");
    expect(describeList(1, false)).toBe("1 œuvre");
    expect(describeList(12, false)).toBe("12 œuvres");
    expect(describeList(12, true)).toBe("12 œuvres · classement");
  });
});
