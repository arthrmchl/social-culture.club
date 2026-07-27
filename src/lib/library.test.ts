import { describe, it, expect } from "vitest";
import {
  libraryHref,
  libraryParams,
  parseLibraryQuery,
  type LibraryQuery,
} from "./library";

describe("parseLibraryQuery", () => {
  it("prend les défauts sur une URL nue", () => {
    expect(parseLibraryQuery({})).toEqual({
      type: undefined,
      state: undefined,
      minScore: undefined,
      year: undefined,
      genre: undefined,
      tag: undefined,
      sort: "recent",
      view: "grille",
    });
  });

  it("lit les facettes valides", () => {
    const q = parseLibraryQuery({
      type: "BOOK",
      statut: "IN_PROGRESS",
      annee: "2021",
      genre: "policier",
      tag: "a-relire",
      tri: "note",
      vue: "liste",
    });
    expect(q.type).toBe("BOOK");
    expect(q.state).toBe("IN_PROGRESS");
    expect(q.year).toBe(2021);
    expect(q.genre).toBe("policier");
    expect(q.tag).toBe("a-relire");
    expect(q.sort).toBe("note");
    expect(q.view).toBe("liste");
  });

  it("ramène l'inconnu au défaut plutôt que de lever", () => {
    const q = parseLibraryQuery({
      type: "PODCAST",
      statut: "PERDU",
      tri: "n-importe-quoi",
      vue: "mosaique",
    });
    expect(q.type).toBeUndefined();
    expect(q.state).toBeUndefined();
    expect(q.sort).toBe("recent");
    expect(q.view).toBe("grille");
  });

  it("accepte la virgule française pour la note et la stocke sur 10", () => {
    expect(parseLibraryQuery({ note: "3,5" }).minScore).toBe(7);
    expect(parseLibraryQuery({ note: "3.5" }).minScore).toBe(7);
    expect(parseLibraryQuery({ note: "5" }).minScore).toBe(10);
  });

  it("arrondit une note au demi-point et écarte le hors-échelle", () => {
    expect(parseLibraryQuery({ note: "3,7" }).minScore).toBe(7);
    expect(parseLibraryQuery({ note: "0" }).minScore).toBeUndefined();
    expect(parseLibraryQuery({ note: "9" }).minScore).toBeUndefined();
    expect(parseLibraryQuery({ note: "abc" }).minScore).toBeUndefined();
  });

  it("écarte une année invraisemblable", () => {
    expect(parseLibraryQuery({ annee: "1200" }).year).toBeUndefined();
    expect(parseLibraryQuery({ annee: "20x1" }).year).toBeUndefined();
  });
});

describe("libraryParams", () => {
  it("n'émet jamais les valeurs par défaut", () => {
    const params = libraryParams(parseLibraryQuery({}));
    expect(Object.values(params).every((v) => v === undefined)).toBe(true);
  });

  it("laisse le type au MediaFilter, qui le pose lui-même", () => {
    const params = libraryParams(
      parseLibraryQuery({ type: "FILM", tri: "titre" }),
    );
    expect(params).not.toHaveProperty("type");
    expect(params.tri).toBe("titre");
  });
});

describe("libraryHref", () => {
  const base: LibraryQuery = parseLibraryQuery({ type: "BOOK", tri: "note" });

  it("conserve les autres facettes en modifiant l'une d'elles", () => {
    expect(libraryHref("/bibliotheque", base, { view: "liste" })).toBe(
      "/bibliotheque?type=BOOK&tri=note&vue=liste",
    );
  });

  it("retire une facette remise à « tous »", () => {
    expect(libraryHref("/bibliotheque", base, { type: undefined })).toBe(
      "/bibliotheque?tri=note",
    );
  });

  it("rend le chemin nu quand tout est au défaut", () => {
    expect(
      libraryHref("/bibliotheque", base, { type: undefined, sort: "recent" }),
    ).toBe("/bibliotheque");
  });

  it("fait un aller-retour stable", () => {
    const q = parseLibraryQuery({
      type: "MANGA_SERIES",
      statut: "COMPLETED",
      note: "4,5",
      annee: "2019",
      genre: "seinen",
      tag: "coup-de-coeur",
      tri: "annee",
      vue: "liste",
    });
    const href = libraryHref("/bibliotheque", q, {});
    const sp = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseLibraryQuery(sp)).toEqual(q);
  });
});
