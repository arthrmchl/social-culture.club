import { describe, it, expect } from "vitest";
import {
  scoreMatch,
  decideResolution,
  yearTolerance,
  AUTO_LINK_THRESHOLD,
  MANUAL_FLOOR,
  type ImportCandidate,
} from "./match";
import { emptyWorkRef, type ImportedWorkRef } from "./types";
import type { WorkType } from "@/generated/prisma/enums";

function ref(
  titleFr: string,
  type: WorkType = "FILM",
  extra: Partial<ImportedWorkRef> = {},
): ImportedWorkRef {
  return { ...emptyWorkRef(type, titleFr), ...extra };
}

function candidate(
  titleNormalized: string,
  sim: number,
  extra: Partial<ImportCandidate> = {},
): ImportCandidate {
  return {
    id: `w-${titleNormalized}-${sim}`,
    type: "FILM",
    titleFr: titleNormalized,
    titleNormalized,
    year: null,
    isbn: null,
    coverImageId: null,
    creators: [],
    sim,
    ...extra,
  };
}

describe("yearTolerance", () => {
  it("est stricte pour l'image et large pour l'écrit", () => {
    expect(yearTolerance("FILM")).toBe(1);
    expect(yearTolerance("SERIES")).toBe(1);
    expect(yearTolerance("BOOK")).toBeGreaterThan(10);
  });
});

describe("scoreMatch", () => {
  it("donne le score maximal à un ISBN identique", () => {
    const r = ref("Peu importe", "BOOK", { isbn: "9782070612888" });
    const c = candidate("tout autre titre", 0.1, {
      type: "BOOK",
      isbn: "9782070612888",
    });
    expect(scoreMatch(r, c)).toBe(1);
  });

  it("récompense un titre identique et une année proche", () => {
    const r = ref("Dune", "FILM", { year: 2021 });
    const c = candidate("dune", 1, { year: 2021 });
    expect(scoreMatch(r, c)).toBeGreaterThanOrEqual(AUTO_LINK_THRESHOLD);
  });

  it("pénalise un écart d'année important pour un film", () => {
    const r = ref("Dune", "FILM", { year: 2021 });
    const proche = candidate("dune", 1, { year: 2021 });
    const lointain = candidate("dune", 1, { year: 1984 });
    expect(scoreMatch(r, lointain)).toBeLessThan(scoreMatch(r, proche));
  });

  it("tolère un écart d'année important pour un livre", () => {
    const r = ref("Dune", "BOOK", { year: 1965 });
    const c = candidate("dune", 1, { type: "BOOK", year: 2005 });
    expect(scoreMatch(r, c)).toBeGreaterThanOrEqual(AUTO_LINK_THRESHOLD);
  });

  it("ne tranche pas sur l'année quand elle est inconnue", () => {
    const inconnue = scoreMatch(ref("Dune"), candidate("dune", 1, { year: 2021 }));
    expect(inconnue).toBeGreaterThan(MANUAL_FLOOR);
    expect(inconnue).toBeLessThan(1);
  });

  it("pénalise un type incompatible", () => {
    const r = ref("Dune", "FILM", { year: 2021 });
    const livre = candidate("dune", 1, { type: "BOOK", year: 2021 });
    const film = candidate("dune", 1, { type: "FILM", year: 2021 });
    expect(scoreMatch(r, livre)).toBeLessThan(scoreMatch(r, film));
  });

  it("rapproche série et animé sans les confondre", () => {
    const r = ref("Frieren", "ANIME", { year: 2023 });
    const serie = candidate("frieren", 1, { type: "SERIES", year: 2023 });
    const film = candidate("frieren", 1, { type: "FILM", year: 2023 });
    expect(scoreMatch(r, serie)).toBeGreaterThan(scoreMatch(r, film));
  });

  it("bonifie un créateur en commun", () => {
    // Titre imparfait, sinon le score plafonne déjà à 1 et le bonus est invisible.
    const r = ref("Dune", "BOOK", { year: 1965, creators: ["Frank Herbert"] });
    const avec = candidate("dune le cycle", 0.7, {
      type: "BOOK",
      year: 1965,
      creators: ["frank herbert"],
    });
    const sans = candidate("dune le cycle", 0.7, { type: "BOOK", year: 1965 });
    expect(scoreMatch(r, avec)).toBeGreaterThan(scoreMatch(r, sans));
  });

  it("reste borné entre 0 et 1", () => {
    const r = ref("Dune", "BOOK", { year: 1965, creators: ["Frank Herbert"] });
    const c = candidate("dune", 1, {
      type: "BOOK",
      year: 1965,
      creators: ["Frank Herbert"],
    });
    expect(scoreMatch(r, c)).toBeLessThanOrEqual(1);
    expect(scoreMatch(ref("xyz"), candidate("abc", 0))).toBeGreaterThanOrEqual(0);
  });
});

describe("decideResolution", () => {
  it("crée quand le catalogue ne propose rien", () => {
    const d = decideResolution(ref("Dune"), []);
    expect(d).toEqual({
      resolution: "CREATE",
      workId: null,
      confidence: 0,
      auto: true,
    });
  });

  it("crée quand le meilleur candidat est trop faible", () => {
    const d = decideResolution(ref("Dune", "FILM", { year: 2021 }), [
      candidate("un tout autre film", 0.31, { year: 1950 }),
    ]);
    expect(d.resolution).toBe("CREATE");
    expect(d.auto).toBe(true);
  });

  it("rattache automatiquement un titre identique du même média", () => {
    const d = decideResolution(ref("Dune", "FILM", { year: 2021 }), [
      candidate("dune", 1, { year: 2021 }),
    ]);
    expect(d.resolution).toBe("LINK");
    expect(d.auto).toBe(true);
    expect(d.confidence).toBeGreaterThanOrEqual(AUTO_LINK_THRESHOLD);
  });

  it("demande à l'utilisateur quand deux candidats se valent", () => {
    const d = decideResolution(ref("Dune", "FILM", { year: 2021 }), [
      candidate("dune", 1, { year: 2021, isbn: null }),
      candidate("dune", 1, { year: 2021, isbn: null }),
    ]);
    expect(d.resolution).toBe("LINK");
    expect(d.auto).toBe(false);
  });

  it("demande à l'utilisateur dans la zone grise", () => {
    const d = decideResolution(ref("Dune", "FILM", { year: 2021 }), [
      candidate("dune 2021 version longue", 0.62, { year: 2021 }),
    ]);
    expect(d.auto).toBe(false);
    expect(d.workId).not.toBeNull();
  });

  it("propose toujours le meilleur candidat quand il en propose un", () => {
    const d = decideResolution(ref("Dune", "FILM", { year: 2021 }), [
      candidate("dune", 0.7, { year: 2021 }),
      candidate("dune messiah", 0.4, { year: 2024 }),
    ]);
    expect(d.workId).toBe("w-dune-0.7");
  });

  it("est déterministe quand deux candidats ont le même score", () => {
    const cs = [candidate("dune", 1, { year: 2021 }), candidate("dune", 1, { year: 2021 })];
    const a = decideResolution(ref("Dune", "FILM", { year: 2021 }), cs);
    const b = decideResolution(ref("Dune", "FILM", { year: 2021 }), [...cs].reverse());
    expect(a.workId).toBe(b.workId);
  });

  it("rattache un titre et un type identiques malgré une année inconnue", () => {
    // Cas limite tombant pile sur le seuil : sans arrondi du score, l'erreur
    // de virgule flottante le renvoyait à tort à l'utilisateur.
    const d = decideResolution(ref("Blade Runner 2049", "FILM", { year: 2017 }), [
      candidate("blade runner 2049", 1, { type: "FILM", year: null }),
    ]);
    expect(d.confidence).toBe(0.9);
    expect(d.resolution).toBe("LINK");
    expect(d.auto).toBe(true);
  });

  it("rattache un ré-import à la fiche créée au passage précédent", () => {
    // Une fiche créée par un import porte exactement le titre importé.
    const importe = ref("Le Voyage de Chihiro", "FILM", { year: 2001 });
    const deja = candidate("le voyage de chihiro", 1, {
      type: "FILM",
      year: 2001,
    });
    const d = decideResolution(importe, [deja]);
    expect(d.resolution).toBe("LINK");
    expect(d.auto).toBe(true);
  });
});
