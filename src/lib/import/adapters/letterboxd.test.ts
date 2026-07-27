import { describe, it, expect } from "vitest";
import { letterboxdAdapter } from "./letterboxd";
import { loadFixture } from "../fixtures";
import { DEFAULT_IMPORT_OPTIONS, type ImportedEvent } from "../types";

const files = loadFixture("letterboxd");
const result = letterboxdAdapter.parse(files, DEFAULT_IMPORT_OPTIONS);

const logsOf = (title: string): ImportedEvent[] =>
  result.events.filter((e) => e.kind === "LOG" && e.work.titleFr === title);

describe("détection de la source", () => {
  it("reconnaît un export Letterboxd", () => {
    expect(letterboxdAdapter.detect(files)).toBeGreaterThan(0.8);
  });

  it("ne reconnaît pas un export étranger", () => {
    expect(
      letterboxdAdapter.detect([{ name: "library.csv", content: "Title,Author\n" }]),
    ).toBe(0);
  });
});

describe("fusion des fichiers (la règle qui évite les doublons)", () => {
  it("ne crée qu'une entrée par visionnage du journal", () => {
    // Dune apparaît dans diary (×2), reviews, watched, ratings et likes.
    expect(logsOf("Dune")).toHaveLength(2);
  });

  it("rattache la critique au bon visionnage plutôt que d'en créer un", () => {
    const [premier] = logsOf("Dune").filter(
      (e) => e.loggedAt?.toISOString().startsWith("2026-03-14"),
    );
    expect(premier.reviewText).toContain("claque visuelle");
    expect(premier.reviewText).toContain("Le sable");
  });

  it("crée une entrée pour une critique sans visionnage correspondant", () => {
    const arrival = logsOf("Arrival");
    expect(arrival).toHaveLength(1);
    expect(arrival[0].reviewText).toBe("Vu sans le noter sur le moment.");
  });

  it("ne reprend de watched.csv que les films absents du journal", () => {
    expect(logsOf("Blade Runner 2049")).toHaveLength(1);
    expect(logsOf("Dune").some((e) => e.sourceFile === "watched.csv")).toBe(false);
  });

  it("laisse sans date une reprise de watched.csv", () => {
    const [br] = logsOf("Blade Runner 2049");
    expect(br.loggedAt).toBeNull();
    expect(br.datePrecision).toBe("UNKNOWN");
  });

  it("donne une graine distincte à chaque visionnage", () => {
    const seeds = logsOf("Dune").map((e) => e.seed);
    expect(new Set(seeds).size).toBe(2);
  });
});

describe("valeurs importées", () => {
  it("convertit la note sur l'échelle interne", () => {
    const [premier] = logsOf("Dune").filter((e) => !e.isRewatch);
    expect(premier.rating).toBe(9); // 4,5 étoiles
  });

  it("marque le revisionnage", () => {
    expect(logsOf("Dune").some((e) => e.isRewatch)).toBe(true);
  });

  it("reprend les tags comme contexte", () => {
    const [premier] = logsOf("Dune");
    expect(premier.context).toBe("science-fiction, cinéma");
  });

  it("reprend l'année et l'identifiant de la source", () => {
    const [premier] = logsOf("Dune");
    expect(premier.work.year).toBe(2021);
    expect(premier.work.externalId).toBe("letterboxd:dune-2021");
    expect(premier.work.type).toBe("FILM");
  });

  it("produit une note actuelle depuis ratings.csv", () => {
    const ratings = result.events.filter((e) => e.kind === "RATING");
    expect(ratings.map((e) => e.work.titleFr).sort()).toEqual([
      "Blade Runner 2049",
      "Dune",
    ]);
  });

  it("produit un j'aime depuis likes/films.csv", () => {
    const likes = result.events.filter((e) => e.kind === "LIKE");
    expect(likes).toHaveLength(1);
    expect(likes[0].work.titleFr).toBe("Dune");
  });

  it("produit une envie de voir depuis watchlist.csv", () => {
    const wl = result.events.filter((e) => e.kind === "WATCHLIST");
    expect(wl).toHaveLength(1);
    expect(wl[0].work.titleFr).toBe("Mickey 17");
    expect(wl[0].state).toBe("WANT");
    expect(wl[0].watchlistedAt?.toISOString()).toContain("2026-07-01");
  });
});

describe("listes et fichiers non exploités", () => {
  it("conserve les listes sans les appliquer", () => {
    expect(result.retained.map((f) => f.name)).toEqual(["lists/mes-favoris.csv"]);
    expect(result.events.some((e) => e.kind === "LIST_ITEM")).toBe(false);
  });

  it("signale les fichiers non exploités", () => {
    expect(
      result.warnings.some((w) => w.file === "profile.csv" && w.level === "info"),
    ).toBe(true);
  });
});

describe("options", () => {
  it("permet d'ignorer watchlist, likes et critiques", () => {
    const r = letterboxdAdapter.parse(files, {
      ...DEFAULT_IMPORT_OPTIONS,
      importWatchlist: false,
      importLikes: false,
      importReviews: false,
    });
    expect(r.events.some((e) => e.kind === "WATCHLIST")).toBe(false);
    expect(r.events.some((e) => e.kind === "LIKE")).toBe(false);
    expect(r.events.some((e) => e.reviewText !== null)).toBe(false);
  });

  it("peut dater les reprises de watched.csv par la date d'ajout", () => {
    const r = letterboxdAdapter.parse(files, {
      ...DEFAULT_IMPORT_OPTIONS,
      watchedDateFallback: "addedDate",
    });
    const br = r.events.find(
      (e) => e.kind === "LOG" && e.work.titleFr === "Blade Runner 2049",
    );
    expect(br?.loggedAt?.toISOString()).toContain("2025-06-01");
  });
});

describe("robustesse", () => {
  it("signale une erreur plutôt que de planter sur des fichiers vides", () => {
    const r = letterboxdAdapter.parse([{ name: "diary.csv", content: "" }], DEFAULT_IMPORT_OPTIONS);
    expect(r.events).toHaveLength(0);
    expect(r.warnings.some((w) => w.level === "error")).toBe(true);
  });

  it("signale une colonne obligatoire absente sans interrompre l'import", () => {
    const r = letterboxdAdapter.parse(
      [
        { name: "diary.csv", content: "Date,Year\n2026-01-01,2021\n" },
        files.find((f) => f.name === "watchlist.csv")!,
      ],
      DEFAULT_IMPORT_OPTIONS,
    );
    expect(
      r.warnings.some((w) => w.file === "diary.csv" && w.message.includes("name")),
    ).toBe(true);
    expect(r.events.some((e) => e.kind === "WATCHLIST")).toBe(true);
  });
});
