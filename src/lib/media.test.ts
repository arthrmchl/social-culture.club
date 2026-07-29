import { describe, it, expect } from "vitest";
import {
  creatorsLabel,
  formatYears,
  isSerial,
  yearLabels,
  MEDIA_ORDER,
} from "./media";

describe("isSerial", () => {
  it("retient les œuvres qui se publient sur une période", () => {
    expect(isSerial("SERIES")).toBe(true);
    expect(isSerial("ANIME")).toBe(true);
    expect(isSerial("BD_SERIES")).toBe(true);
    expect(isSerial("MANGA_SERIES")).toBe(true);
  });

  it("écarte le film et le livre, qui paraissent en une fois", () => {
    expect(isSerial("FILM")).toBe(false);
    expect(isSerial("BOOK")).toBe(false);
  });
});

describe("formatYears", () => {
  it("annonce une année inconnue plutôt qu'un trou", () => {
    expect(formatYears({ type: "FILM", year: null, endYear: null })).toBe(
      "Année inconnue",
    );
  });

  it("n'affiche qu'une année pour un film ou un livre", () => {
    expect(formatYears({ type: "FILM", year: 2001, endYear: null })).toBe(
      "2001",
    );
    expect(formatYears({ type: "BOOK", year: 1922, endYear: null })).toBe(
      "1922",
    );
  });

  it("affiche la période d'une œuvre sérielle achevée", () => {
    expect(
      formatYears({ type: "MANGA_SERIES", year: 1989, endYear: 2021 }),
    ).toBe("1989 – 2021");
  });

  it("dit « en cours » quand l'année de fin manque", () => {
    expect(
      formatYears({ type: "MANGA_SERIES", year: 1989, endYear: null }),
    ).toBe("1989 – en cours");
  });

  it("ignore une année de fin posée sur un média non sériel", () => {
    expect(formatYears({ type: "FILM", year: 2001, endYear: 2003 })).toBe(
      "2001",
    );
  });
});

describe("yearLabels", () => {
  it("ne propose une fin qu'aux œuvres sérielles", () => {
    for (const type of MEDIA_ORDER) {
      expect(Boolean(yearLabels(type).end)).toBe(isSerial(type));
    }
  });

  it("dit « diffusion » pour l'écran et « publication » pour le papier", () => {
    expect(yearLabels("SERIES").start).toContain("diffusion");
    expect(yearLabels("MANGA_SERIES").start).toContain("publication");
  });
});

describe("creatorsLabel", () => {
  it("donne des auteur·rice·s au livre et au manga", () => {
    expect(creatorsLabel("BOOK")).toBe("Auteur·rice(s)");
    expect(creatorsLabel("MANGA_SERIES")).toBe("Auteur·rice(s)");
  });

  it("s'en tient à « Créateurs » ailleurs — une BD a scénariste et dessinateur", () => {
    expect(creatorsLabel("BD_SERIES")).toBe("Créateurs");
    expect(creatorsLabel("FILM")).toBe("Créateurs");
  });
});
