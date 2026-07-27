import { describe, it, expect } from "vitest";
import { toCsvField, toCsvLine, toCsv, type CsvColumn } from "./csv";
import { parseCsv, toRecords } from "@/lib/import/csv";

describe("toCsvField", () => {
  it("laisse une valeur simple telle quelle", () => {
    expect(toCsvField("Dune")).toBe("Dune");
    expect(toCsvField(42)).toBe("42");
  });

  it("rend une chaîne vide pour null et undefined", () => {
    expect(toCsvField(null)).toBe("");
    expect(toCsvField(undefined)).toBe("");
  });

  it("écrit les booléens en français", () => {
    expect(toCsvField(true)).toBe("oui");
    expect(toCsvField(false)).toBe("non");
  });

  it("écrit les dates en ISO", () => {
    expect(toCsvField(new Date("2026-03-14T12:00:00.000Z"))).toBe(
      "2026-03-14T12:00:00.000Z",
    );
  });

  it("protège les virgules, guillemets et sauts de ligne", () => {
    expect(toCsvField("Berserk, Vol. 12")).toBe('"Berserk, Vol. 12"');
    expect(toCsvField('Il dit "non"')).toBe('"Il dit ""non"""');
    expect(toCsvField("deux\nlignes")).toBe('"deux\nlignes"');
  });
});

describe("toCsvLine", () => {
  it("joint les valeurs par des virgules", () => {
    expect(toCsvLine(["a", 1, null])).toBe("a,1,");
  });
});

type Ligne = { titre: string; note: number | null; vu: boolean; critique: string };

const COLONNES: CsvColumn<Ligne>[] = [
  { header: "Titre", value: (r) => r.titre },
  { header: "Note", value: (r) => r.note },
  { header: "Vu", value: (r) => r.vu },
  { header: "Critique", value: (r) => r.critique },
];

describe("toCsv", () => {
  it("écrit l'en-tête même sans ligne", () => {
    expect(toCsv([], COLONNES)).toBe("Titre,Note,Vu,Critique\n");
  });

  it("se relit à l'identique avec le parseur d'import (aller-retour)", () => {
    const lignes: Ligne[] = [
      { titre: "Dune", note: 9, vu: true, critique: "Une claque." },
      {
        titre: "Berserk, Vol. 12",
        note: null,
        vu: false,
        critique: 'Il dit "non"\net s\'en va.',
      },
    ];

    const relu = toRecords(parseCsv(toCsv(lignes, COLONNES)));

    expect(relu).toEqual([
      { Titre: "Dune", Note: "9", Vu: "oui", Critique: "Une claque." },
      {
        Titre: "Berserk, Vol. 12",
        Note: "",
        Vu: "non",
        Critique: 'Il dit "non"\net s\'en va.',
      },
    ]);
  });
});
