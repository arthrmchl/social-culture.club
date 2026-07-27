import { describe, it, expect } from "vitest";
import { normalizeHeader, pickColumn, resolveColumns, cell } from "./headers";

const ALIASES = {
  title: ["Title", "Name", "titre"],
  rating: ["My Rating", "Rating"],
  isbn: ["ISBN13", "ISBN"],
} as const;

describe("normalizeHeader", () => {
  it("ignore casse, accents et ponctuation", () => {
    expect(normalizeHeader(" Année  de   Publication ")).toBe(
      "annee de publication",
    );
  });
});

describe("pickColumn", () => {
  it("trouve la colonne quelle que soit la casse", () => {
    expect(pickColumn(["book id", "TITLE"], ALIASES.title)).toBe("TITLE");
  });

  it("respecte l'ordre de préférence des alias", () => {
    expect(pickColumn(["Name", "Title"], ALIASES.title)).toBe("Title");
  });

  it("rend null quand aucun alias ne correspond", () => {
    expect(pickColumn(["Author"], ALIASES.title)).toBeNull();
  });
});

describe("resolveColumns", () => {
  it("résout le plan complet et signale les colonnes obligatoires absentes", () => {
    const { map, missing } = resolveColumns(
      ["Name", "My Rating"],
      ALIASES,
      ["title", "isbn"],
    );
    expect(map.title).toBe("Name");
    expect(map.rating).toBe("My Rating");
    expect(map.isbn).toBeNull();
    expect(missing).toEqual(["isbn"]);
  });

  it("ne signale rien quand aucune colonne n'est obligatoire", () => {
    expect(resolveColumns(["Autre"], ALIASES).missing).toEqual([]);
  });
});

describe("cell", () => {
  it("lit la valeur en la débarrassant des espaces", () => {
    const { map } = resolveColumns(["Name"], ALIASES);
    expect(cell({ Name: "  Dune  " }, map, "title")).toBe("Dune");
  });

  it("rend une chaîne vide quand la colonne est absente", () => {
    const { map } = resolveColumns(["Name"], ALIASES);
    expect(cell({ Name: "Dune" }, map, "isbn")).toBe("");
  });
});
