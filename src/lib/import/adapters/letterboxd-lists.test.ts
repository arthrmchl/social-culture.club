import { describe, it, expect } from "vitest";
import { parseLetterboxdList, parseLetterboxdLists } from "./letterboxd-lists";
import { loadFixture } from "../fixtures";
import type { ImportWarning } from "../types";

const listFiles = loadFixture("letterboxd").filter((f) =>
  f.name.includes("lists/"),
);

describe("parseLetterboxdList", () => {
  it("lit les deux blocs d'un fichier de liste", () => {
    const warnings: ImportWarning[] = [];
    const list = parseLetterboxdList(listFiles[0], warnings);

    expect(list).not.toBeNull();
    expect(list!.name).toBe("Mes favoris");
    expect(list!.slug).toBe("mes-favoris");
    expect(list!.description).toBe("Une liste de test");
    expect(list!.createdAt?.toISOString()).toContain("2026-01-01");
    expect(list!.isRanked).toBe(true);
  });

  it("ne confond pas l'en-tête des métadonnées avec celui des éléments", () => {
    // Les deux blocs portent une colonne « Name » : c'est tout le piège.
    const list = parseLetterboxdList(listFiles[0], []);
    expect(list!.items).toHaveLength(2);
    expect(list!.items.map((i) => i.titleFr)).toEqual(["Dune", "Arrival"]);
  });

  it("reprend position, année et slug de chaque élément", () => {
    const [dune, arrival] = parseLetterboxdList(listFiles[0], [])!.items;

    expect(dune).toMatchObject({
      position: 1,
      titleFr: "Dune",
      year: 2021,
      externalId: "letterboxd:dune-2021",
    });
    expect(arrival).toMatchObject({
      position: 2,
      titleFr: "Arrival",
      year: 2016,
      externalId: "letterboxd:arrival-2016",
    });
  });

  it("écarte un fichier sans bloc d'éléments, sans lever (R5)", () => {
    const warnings: ImportWarning[] = [];
    const list = parseLetterboxdList(
      {
        name: "lists/vide.csv",
        content:
          "Date,Name,Tags,URL,Description\n2026-01-01,Vide,,https://x,\n",
      },
      warnings,
    );

    expect(list).toBeNull();
    expect(warnings[0].message).toContain("aucun film");
  });

  it("écarte un fichier qui n'est pas une liste, sans lever (R5)", () => {
    const warnings: ImportWarning[] = [];
    expect(
      parseLetterboxdList(
        { name: "x.csv", content: "n'importe quoi" },
        warnings,
      ),
    ).toBeNull();
    expect(warnings).toHaveLength(1);
  });

  it("rend la liste non ordonnée quand les positions sont incomplètes", () => {
    const warnings: ImportWarning[] = [];
    const list = parseLetterboxdList(
      {
        name: "lists/partielle.csv",
        content: [
          "Date,Name,Tags,URL,Description",
          "2026-01-01,Partielle,,https://x,",
          "",
          "Position,Name,Year,Letterboxd URI,Description",
          "1,Dune,2021,https://letterboxd.com/film/dune-2021/,",
          ",Arrival,2016,https://letterboxd.com/film/arrival-2016/,",
        ].join("\n"),
      },
      warnings,
    );

    expect(list!.isRanked).toBe(false);
    expect(warnings.some((w) => w.message.includes("sans classement"))).toBe(
      true,
    );
  });

  it("signale les étiquettes de liste, qui ne sont pas reprises", () => {
    const warnings: ImportWarning[] = [];
    parseLetterboxdList(
      {
        name: "lists/taguee.csv",
        content: [
          "Date,Name,Tags,URL,Description",
          '2026-01-01,Taguée,"cinéma, 2026",https://x,',
          "",
          "Position,Name,Year,Letterboxd URI,Description",
          "1,Dune,2021,https://letterboxd.com/film/dune-2021/,",
        ].join("\n"),
      },
      warnings,
    );

    expect(warnings.some((w) => w.message.includes("étiquettes"))).toBe(true);
  });

  it("reprend le commentaire par élément", () => {
    const list = parseLetterboxdList(
      {
        name: "lists/commentee.csv",
        content: [
          "Date,Name,Tags,URL,Description",
          "2026-01-01,Commentée,,https://x,",
          "",
          "Position,Name,Year,Letterboxd URI,Description",
          '1,Dune,2021,https://letterboxd.com/film/dune-2021/,"Le meilleur, de loin"',
        ].join("\n"),
      },
      [],
    );

    expect(list!.items[0].note).toBe("Le meilleur, de loin");
  });
});

describe("parseLetterboxdLists", () => {
  it("agrège les listes et leurs avertissements", () => {
    const { lists, warnings } = parseLetterboxdLists([
      ...listFiles,
      { name: "lists/cassee.csv", content: "" },
    ]);

    expect(lists).toHaveLength(1);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
