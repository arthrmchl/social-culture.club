import { describe, expect, it } from "vitest";
import {
  buildExcerpt,
  buildLabel,
  EXCERPT_LENGTH,
  isReportReason,
  parseModerationTab,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  REPORT_TARGET_LABELS,
} from "./moderation";

describe("buildExcerpt", () => {
  it("renvoie null pour un texte absent ou vide", () => {
    expect(buildExcerpt(null)).toBeNull();
    expect(buildExcerpt(undefined)).toBeNull();
    expect(buildExcerpt("")).toBeNull();
    expect(buildExcerpt("   \n  ")).toBeNull();
  });

  it("laisse un texte court intact", () => {
    expect(buildExcerpt("Un avis tranché.")).toBe("Un avis tranché.");
  });

  it("retire l'emphase et les titres markdown", () => {
    expect(buildExcerpt("## **Génial** et _juste_")).toBe("Génial et juste");
  });

  it("garde le libellé d'un lien et jette l'URL", () => {
    expect(buildExcerpt("Voir [ce site](https://exemple.fr) plutôt")).toBe(
      "Voir ce site plutôt",
    );
  });

  it("aplatit les sauts de ligne et les espaces", () => {
    expect(buildExcerpt("a\n\n  b   c")).toBe("a b c");
  });

  it("retire les puces de liste", () => {
    expect(buildExcerpt("- premier\n- second")).toBe("premier second");
  });

  it("tronque sur une frontière de mot et pose une ellipse", () => {
    const text = `${"mot ".repeat(100)}fin`;
    const out = buildExcerpt(text)!;
    expect(out.length).toBeLessThanOrEqual(EXCERPT_LENGTH + 1);
    expect(out.endsWith("…")).toBe(true);
    expect(out.endsWith(" …")).toBe(false);
  });

  it("coupe net un mot interminable plutôt que de tout perdre", () => {
    // Reculer jusqu'à la dernière espace donnerait un extrait vide.
    const out = buildExcerpt("a".repeat(500))!;
    expect(out).toBe(`${"a".repeat(EXCERPT_LENGTH)}…`);
  });

  it("respecte une longueur maximale personnalisée", () => {
    const out = buildExcerpt("un deux trois quatre cinq six", 10)!;
    expect(out.length).toBeLessThanOrEqual(11);
  });
});

describe("buildLabel", () => {
  it("garde le titre fourni", () => {
    expect(buildLabel("LIST", "Mes indispensables")).toBe("Mes indispensables");
  });

  it("retombe sur le nom de la nature quand le titre manque", () => {
    // La file de modération doit rester lisible même si le contenu a disparu.
    expect(buildLabel("LIST", null)).toBe("Liste");
    expect(buildLabel("COMMENT", "   ")).toBe("Commentaire");
    expect(buildLabel("USER", undefined)).toBe("Compte");
  });
});

describe("parseModerationTab", () => {
  it("ne lève jamais et retombe sur « ouverts »", () => {
    expect(parseModerationTab(undefined)).toBe("ouverts");
    expect(parseModerationTab("")).toBe("ouverts");
    expect(parseModerationTab("n'importe quoi")).toBe("ouverts");
    expect(parseModerationTab("ouverts")).toBe("ouverts");
  });

  it("reconnaît l'onglet des signalements traités", () => {
    expect(parseModerationTab("traites")).toBe("traites");
  });
});

describe("libellés", () => {
  it("nomme les sept motifs et les six natures en français", () => {
    expect(REPORT_REASONS).toHaveLength(7);
    for (const r of REPORT_REASONS) {
      expect(REPORT_REASON_LABELS[r].length).toBeGreaterThan(0);
    }
    expect(Object.keys(REPORT_TARGET_LABELS)).toHaveLength(6);
  });

  it("reconnaît un motif valable et rejette le reste", () => {
    expect(isReportReason("SPAM")).toBe(true);
    expect(isReportReason("BOF")).toBe(false);
  });
});
