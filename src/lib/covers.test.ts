import { describe, it, expect } from "vitest";
import { pickCoverImageId, type CoverEdition } from "./covers";

const poche: CoverEdition = { id: "poche", coverImageId: "img-poche" };
const broche: CoverEdition = {
  id: "broche",
  coverImageId: "img-broche",
  isDefault: true,
};

describe("pickCoverImageId", () => {
  it("laisse la fiche porter son visuel hors lecture", () => {
    expect(pickCoverImageId({ type: "FILM", coverImageId: "img" }, [])).toBe(
      "img",
    );
    // Un film n'a pas d'édition, mais si l'on en fabriquait une elle ne
    // prendrait pas le pas sur la fiche.
    expect(
      pickCoverImageId({ type: "FILM", coverImageId: "img" }, [poche], "poche"),
    ).toBe("img");
  });

  it("préfère l'édition que je lis", () => {
    expect(pickCoverImageId({ type: "BOOK" }, [broche, poche], "poche")).toBe(
      "img-poche",
    );
  });

  it("retombe sur l'édition par défaut", () => {
    expect(pickCoverImageId({ type: "BOOK" }, [poche, broche])).toBe(
      "img-broche",
    );
    expect(
      pickCoverImageId({ type: "MANGA_SERIES" }, [poche, broche], "inconnue"),
    ).toBe("img-broche");
  });

  it("ne s'arrête pas sur une édition lue sans visuel", () => {
    const nue: CoverEdition = { id: "nue", coverImageId: null };
    expect(pickCoverImageId({ type: "BOOK" }, [broche, nue], "nue")).toBe(
      "img-broche",
    );
  });

  it("ignore le visuel resté sur une fiche de lecture", () => {
    expect(
      pickCoverImageId({ type: "BD_SERIES", coverImageId: "vieux" }, []),
    ).toBeNull();
  });

  it("renvoie null sans édition — la vignette générée prendra le relais", () => {
    expect(pickCoverImageId({ type: "BOOK" }, [])).toBeNull();
  });
});
