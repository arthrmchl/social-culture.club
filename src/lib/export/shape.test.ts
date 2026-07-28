import { describe, it, expect } from "vitest";
import {
  exportFilename,
  isCsvEntity,
  CSV_ENTITIES,
  ENTITY_LABELS,
  EXPORT_FORMAT,
  EXPORT_VERSION,
} from "./shape";

describe("exportFilename", () => {
  const jour = new Date("2026-07-27T10:00:00.000Z");

  it("compose un nom daté et lisible", () => {
    expect(exportFilename("arthur", "json", jour)).toBe(
      "scc-arthur-2026-07-27.json",
    );
  });

  it("nettoie un nom d'utilisateur exotique", () => {
    expect(exportFilename("Arthur Michel !", "csv", jour)).toBe(
      "scc-arthur-michel-2026-07-27.csv",
    );
  });

  it("retombe sur un nom générique sans utilisateur", () => {
    expect(exportFilename(null, "json", jour)).toBe(
      "scc-export-2026-07-27.json",
    );
    expect(exportFilename("???", "json", jour)).toBe(
      "scc-export-2026-07-27.json",
    );
  });
});

describe("isCsvEntity", () => {
  it("reconnaît les entités exportables", () => {
    expect(isCsvEntity("journal")).toBe(true);
    expect(isCsvEntity("oeuvres")).toBe(true);
  });

  it("refuse tout le reste", () => {
    expect(isCsvEntity("utilisateurs")).toBe(false);
    expect(isCsvEntity("../secret")).toBe(false);
  });
});

describe("contrat du document", () => {
  it("annonce son format et sa version", () => {
    expect(EXPORT_FORMAT).toBe("social-culture.club");
    // Version 6 depuis le lot 6 : les tomes sont passés sous l'édition et
    // l'import a quitté le document. Chaque entité qui apparaît ou disparaît
    // fait bouger le numéro, sans quoi un export récent serait indiscernable
    // d'un export où l'utilisateur n'avait rien saisi.
    expect(EXPORT_VERSION).toBe(6);
  });

  it("nomme chaque entité exportable en français", () => {
    for (const entity of CSV_ENTITIES) {
      expect(ENTITY_LABELS[entity]).toBeTruthy();
    }
  });
});
