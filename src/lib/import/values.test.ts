import { describe, it, expect } from "vitest";
import {
  parseImportDate,
  parseHalfStarRating,
  parseIntegerRating,
  parseYear,
  parseCount,
  parseYesNo,
  cleanIsbn,
  htmlToText,
  splitTags,
} from "./values";

describe("parseImportDate", () => {
  it("lit le format Letterboxd YYYY-MM-DD", () => {
    const { date, precision } = parseImportDate("2026-03-14");
    expect(date?.toISOString()).toBe("2026-03-14T12:00:00.000Z");
    expect(precision).toBe("DAY");
  });

  it("lit le format Goodreads YYYY/MM/DD", () => {
    expect(parseImportDate("2026/03/14").date?.toISOString()).toBe(
      "2026-03-14T12:00:00.000Z",
    );
  });

  it("dégrade la précision sur un mois puis une année", () => {
    expect(parseImportDate("2026-03").precision).toBe("MONTH");
    expect(parseImportDate("2026").precision).toBe("YEAR");
  });

  it("lit une date française DD/MM/YYYY", () => {
    expect(parseImportDate("14/03/2026").date?.toISOString()).toBe(
      "2026-03-14T12:00:00.000Z",
    );
  });

  it("lit un horodatage ISO complet", () => {
    expect(parseImportDate("2026-03-14T08:30:00Z").precision).toBe("DAY");
  });

  it("rend une date inconnue pour une valeur vide ou illisible", () => {
    expect(parseImportDate("")).toEqual({ date: null, precision: "UNKNOWN" });
    expect(parseImportDate("bientôt")).toEqual({
      date: null,
      precision: "UNKNOWN",
    });
  });

  it("refuse une date impossible plutôt que de la replier", () => {
    expect(parseImportDate("2026-02-31").date).toBeNull();
    expect(parseImportDate("2026-13-01").date).toBeNull();
  });
});

describe("parseHalfStarRating", () => {
  it("convertit une note Letterboxd en score sur 10", () => {
    expect(parseHalfStarRating("4.5")).toBe(9);
    expect(parseHalfStarRating("0.5")).toBe(1);
    expect(parseHalfStarRating("5")).toBe(10);
  });

  it("accepte la virgule décimale", () => {
    expect(parseHalfStarRating("3,5")).toBe(7);
  });

  it("traite 0 et le vide comme une absence de note", () => {
    expect(parseHalfStarRating("0")).toBeNull();
    expect(parseHalfStarRating("")).toBeNull();
  });
});

describe("parseIntegerRating", () => {
  it("convertit une note Goodreads sur 5 en score sur 10", () => {
    expect(parseIntegerRating("4", 5)).toBe(8);
    expect(parseIntegerRating("0", 5)).toBeNull();
  });

  it("garde une note déjà sur 10", () => {
    expect(parseIntegerRating("7", 10)).toBe(7);
  });

  it("plafonne au maximum de l'échelle", () => {
    expect(parseIntegerRating("9", 5)).toBe(10);
  });
});

describe("parseYear", () => {
  it("accepte une année plausible", () => {
    expect(parseYear("2001")).toBe(2001);
  });

  it("rejette les valeurs vides, nulles ou aberrantes", () => {
    expect(parseYear("")).toBeNull();
    expect(parseYear("0")).toBeNull();
    expect(parseYear("3999")).toBeNull();
  });
});

describe("parseCount", () => {
  it("lit un entier positif et rejette le reste", () => {
    expect(parseCount("312")).toBe(312);
    expect(parseCount("0")).toBeNull();
    expect(parseCount("")).toBeNull();
  });
});

describe("parseYesNo", () => {
  it("reconnaît les formes vraies et fausses", () => {
    expect(parseYesNo("Yes")).toBe(true);
    expect(parseYesNo("true")).toBe(true);
    expect(parseYesNo("1")).toBe(true);
    expect(parseYesNo("No")).toBe(false);
    expect(parseYesNo("")).toBe(false);
  });
});

describe("cleanIsbn", () => {
  it("débarrasse le préfixe tableur de Goodreads", () => {
    expect(cleanIsbn('="9782070612888"')).toBe("9782070612888");
  });

  it("accepte un ISBN-10 avec X final et des tirets", () => {
    expect(cleanIsbn("2-07-061288-X")).toBe("207061288X");
  });

  it("rejette une longueur invalide ou une valeur vide", () => {
    expect(cleanIsbn('=""')).toBeNull();
    expect(cleanIsbn("12345")).toBeNull();
  });
});

describe("htmlToText", () => {
  it("convertit les sauts de ligne et retire les balises", () => {
    expect(htmlToText("Un<br/>deux<br />trois")).toBe("Un\ndeux\ntrois");
    expect(htmlToText("<p>Un</p><p>Deux</p>")).toBe("Un\n\nDeux");
  });

  it("décode les entités courantes", () => {
    expect(htmlToText("Tom &amp; Jerry &quot;classique&quot;")).toBe(
      'Tom & Jerry "classique"',
    );
  });

  it("décode les accents français nommés", () => {
    expect(htmlToText("Le d&eacute;sert, &agrave; perte de vue")).toBe(
      "Le désert, à perte de vue",
    );
    expect(htmlToText("&Eacute;tonnant")).toBe("Étonnant");
  });

  it("décode les entités numériques", () => {
    expect(htmlToText("caf&#233; et cr&#xE8;me")).toBe("café et crème");
  });

  it("laisse intacte une entité inconnue plutôt que d'inventer", () => {
    expect(htmlToText("&inconnue;")).toBe("&inconnue;");
  });

  it("rend une chaîne vide pour une entrée vide", () => {
    expect(htmlToText("")).toBe("");
  });
});

describe("splitTags", () => {
  it("découpe, nettoie et dédoublonne", () => {
    expect(splitTags("scifi, classique , scifi")).toEqual([
      "scifi",
      "classique",
    ]);
  });

  it("rend une liste vide pour une entrée vide", () => {
    expect(splitTags("")).toEqual([]);
  });
});
