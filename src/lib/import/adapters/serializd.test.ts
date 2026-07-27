import { describe, it, expect } from "vitest";
import { serializdAdapter } from "./serializd";
import { loadFixture } from "../fixtures";
import { DEFAULT_IMPORT_OPTIONS } from "../types";

const files = loadFixture("serializd");
const result = serializdAdapter.parse(files, DEFAULT_IMPORT_OPTIONS);

const logsOf = (title: string) =>
  result.events.filter((e) => e.work.titleFr === title);

describe("détection de la source", () => {
  it("reconnaît un export Serializd", () => {
    expect(serializdAdapter.detect(files)).toBeGreaterThan(0.5);
  });
});

describe("entrées de journal", () => {
  it("crée une entrée par saison vue", () => {
    expect(logsOf("Severance")).toHaveLength(2);
    expect(result.events).toHaveLength(4);
  });

  it("rattache l'entrée à sa saison", () => {
    const [s1, s2] = logsOf("Severance");
    expect(s1.work.seasonNumber).toBe(1);
    expect(s2.work.seasonNumber).toBe(2);
  });

  it("convertit la note sur l'échelle interne", () => {
    expect(logsOf("Severance")[0].rating).toBe(9); // 4,5 étoiles
    expect(logsOf("Shogun")[0].rating).toBe(8);
  });

  it("reprend la critique et la date", () => {
    const [s1] = logsOf("Severance");
    expect(s1.reviewText).toBe("Un objet étrange et parfait.");
    expect(s1.loggedAt?.toISOString()).toContain("2026-01-20");
  });

  it("laisse la critique vide plutôt qu'une chaîne vide", () => {
    expect(logsOf("Frieren")[0].reviewText).toBeNull();
  });

  it("donne une graine distincte à chaque saison", () => {
    const seeds = logsOf("Severance").map((e) => e.seed);
    expect(new Set(seeds).size).toBe(2);
  });
});

describe("type des séries", () => {
  it("crée des séries par défaut", () => {
    expect(logsOf("Severance")[0].work.type).toBe("SERIES");
  });

  it("peut créer des animés à la place", () => {
    const r = serializdAdapter.parse(files, {
      ...DEFAULT_IMPORT_OPTIONS,
      seriesDefaultType: "ANIME",
    });
    expect(r.events[0].work.type).toBe("ANIME");
  });
});

describe("robustesse (format à confirmer)", () => {
  it("prévient que les épisodes ne sont pas fournis", () => {
    expect(
      result.warnings.some((w) => w.message.includes("épisodes")),
    ).toBe(true);
  });

  it("importe sans colonne de date, en le signalant", () => {
    const r = serializdAdapter.parse(
      [{ name: "x.csv", content: "Show Title,Season\nSeverance,1\n" }],
      DEFAULT_IMPORT_OPTIONS,
    );
    expect(r.events).toHaveLength(1);
    expect(r.events[0].loggedAt).toBeNull();
    expect(r.warnings.some((w) => w.message.includes("date introuvable"))).toBe(
      true,
    );
  });

  it("importe sans colonne de saison, en le signalant", () => {
    const r = serializdAdapter.parse(
      [{ name: "x.csv", content: "Show Title,Date Watched\nShogun,2026-01-01\n" }],
      DEFAULT_IMPORT_OPTIONS,
    );
    expect(r.events[0].work.seasonNumber).toBeNull();
    expect(r.warnings.some((w) => w.message.includes("saison introuvable"))).toBe(
      true,
    );
  });

  it("signale un fichier étranger sans planter", () => {
    const r = serializdAdapter.parse(
      [{ name: "x.csv", content: "Colonne\nvaleur\n" }],
      DEFAULT_IMPORT_OPTIONS,
    );
    expect(r.events).toHaveLength(0);
    expect(r.warnings.some((w) => w.level === "error")).toBe(true);
  });
});
