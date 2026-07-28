import { describe, it, expect } from "vitest";
import {
  coveredTomeNumbers,
  editionLabel,
  isOmnibus,
  omnibusLabel,
  pageCountFor,
  pickDefaultEdition,
  type EditionLike,
} from "./editions";

const plain: EditionLike = {
  title: null,
  language: null,
  publisher: "Glénat",
  format: "poche",
  pageCount: 210,
  isbn: "9782344012345",
  isDefault: false,
  coversTomeFrom: null,
  coversTomeTo: null,
};

describe("isOmnibus", () => {
  it("suffit d'une borne pour déclarer une intégrale", () => {
    expect(isOmnibus(plain)).toBe(false);
    expect(isOmnibus({ ...plain, coversTomeFrom: 4 })).toBe(true);
    expect(isOmnibus({ ...plain, coversTomeTo: 9 })).toBe(true);
  });
});

describe("coveredTomeNumbers", () => {
  it("déroule l'étendue déclarée", () => {
    expect(
      coveredTomeNumbers({ ...plain, coversTomeFrom: 1, coversTomeTo: 3 }),
    ).toEqual([1, 2, 3]);
  });

  it("remet des bornes inversées à l'endroit", () => {
    expect(
      coveredTomeNumbers({ ...plain, coversTomeFrom: 5, coversTomeTo: 2 }),
    ).toEqual([2, 3, 4, 5]);
  });

  it("traite une borne seule comme un tome unique", () => {
    expect(coveredTomeNumbers({ ...plain, coversTomeFrom: 3 })).toEqual([3]);
    expect(coveredTomeNumbers({ ...plain, coversTomeTo: 3 })).toEqual([3]);
  });

  it("ne couvre rien sans intégrale déclarée", () => {
    expect(coveredTomeNumbers(plain)).toEqual([]);
  });

  it("écarte les numéros hors du domaine des tomes", () => {
    expect(
      coveredTomeNumbers({ ...plain, coversTomeFrom: -4, coversTomeTo: 0 }),
    ).toEqual([]);
    // Une borne basse absurde ne fait pas dérailler la borne haute.
    expect(
      coveredTomeNumbers({ ...plain, coversTomeFrom: -2, coversTomeTo: 2 }),
    ).toEqual([1, 2]);
  });

  it("tronque des bornes non entières", () => {
    expect(
      coveredTomeNumbers({ ...plain, coversTomeFrom: 1.7, coversTomeTo: 3.2 }),
    ).toEqual([1, 2, 3]);
  });
});

describe("editionLabel", () => {
  it("compose ce qui est renseigné", () => {
    expect(editionLabel(plain)).toBe("Glénat · poche · 210 pages");
  });

  it("met le titre de l'édition en tête et nomme la langue", () => {
    expect(editionLabel({ ...plain, title: "Le Seigneur des Anneaux" })).toBe(
      "Le Seigneur des Anneaux · Glénat · poche · 210 pages",
    );
    expect(editionLabel({ ...plain, language: "fr" })).toBe(
      "Glénat · poche · Français · 210 pages",
    );
  });

  it("retombe sur l'ISBN puis sur un libellé neutre", () => {
    const bare: EditionLike = {
      title: null,
      language: null,
      publisher: null,
      format: "  ",
      pageCount: null,
      isbn: "9782344012345",
      isDefault: false,
      coversTomeFrom: null,
      coversTomeTo: null,
    };
    expect(editionLabel(bare)).toBe("ISBN 9782344012345");
    expect(editionLabel({ ...bare, isbn: null })).toBe("Édition sans détail");
  });
});

describe("pageCountFor", () => {
  const poche = { ...plain, id: "poche", pageCount: 380 };
  const broche = { ...plain, id: "broche", pageCount: 210, isDefault: true };

  it("suit l'édition que je lis", () => {
    expect(pageCountFor([broche, poche], "poche")).toBe(380);
  });

  it("retombe sur l'édition par défaut", () => {
    expect(pageCountFor([poche, broche], null)).toBe(210);
    expect(pageCountFor([poche, broche], "disparue")).toBe(210);
  });

  it("ne connaît aucune pagination sans édition", () => {
    expect(pageCountFor([], "poche")).toBeNull();
    expect(pageCountFor([{ ...poche, pageCount: null }], "poche")).toBeNull();
  });
});

describe("omnibusLabel", () => {
  it("décrit l'étendue, au singulier comme au pluriel", () => {
    expect(omnibusLabel({ ...plain, coversTomeFrom: 1, coversTomeTo: 5 })).toBe(
      "Tomes 1 à 5",
    );
    expect(omnibusLabel({ ...plain, coversTomeFrom: 4 })).toBe("Tome 4");
    expect(omnibusLabel(plain)).toBeNull();
  });
});

describe("pickDefaultEdition", () => {
  it("préfère l'édition marquée par défaut", () => {
    const a = { ...plain, publisher: "A" };
    const b = { ...plain, publisher: "B", isDefault: true };
    expect(pickDefaultEdition([a, b])?.publisher).toBe("B");
  });

  it("retombe sur la première à défaut de marquage", () => {
    const a = { ...plain, publisher: "A" };
    expect(pickDefaultEdition([a, { ...plain }])?.publisher).toBe("A");
  });

  it("renvoie null sur une liste vide", () => {
    expect(pickDefaultEdition([])).toBeNull();
  });
});
