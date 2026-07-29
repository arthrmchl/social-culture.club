import { describe, it, expect } from "vitest";
import {
  editionLabel,
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
};

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

  it("annonce le nombre de tomes du tirage, accordé", () => {
    expect(editionLabel(plain, 41)).toBe("Glénat · poche · 210 pages · 41 tomes");
    expect(editionLabel(plain, 1)).toBe("Glénat · poche · 210 pages · 1 tome");
    expect(editionLabel(plain, 0)).toBe("Glénat · poche · 210 pages");
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
