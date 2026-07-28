import { describe, expect, it } from "vitest";
import {
  COMMENT_EMPTY,
  COMMENT_TOO_LONG,
  describeComments,
  describeLikes,
  MAX_COMMENT_LENGTH,
  normalizeCommentBody,
  validateCommentBody,
} from "./comments";

describe("normalizeCommentBody", () => {
  it("normalise les sauts de ligne Windows", () => {
    // Un copier-coller depuis Windows apporte des \r\n qui feraient dérailler
    // le rendu markdown.
    expect(normalizeCommentBody("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("ramène les lignes vides successives à une seule", () => {
    expect(normalizeCommentBody("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  it("conserve un paragraphe volontaire", () => {
    expect(normalizeCommentBody("a\n\nb")).toBe("a\n\nb");
  });

  it("supprime les espaces de bord", () => {
    expect(normalizeCommentBody("  \n bonjour \n  ")).toBe("bonjour");
  });
});

describe("validateCommentBody", () => {
  it("accepte un commentaire ordinaire, nettoyé", () => {
    const res = validateCommentBody("  Très juste. ");
    expect(res).toEqual({ ok: true, body: "Très juste." });
  });

  it("refuse un commentaire vide", () => {
    expect(validateCommentBody("")).toEqual({ ok: false, error: COMMENT_EMPTY });
  });

  it("refuse un commentaire de blancs seuls", () => {
    expect(validateCommentBody("   \n\n  ")).toEqual({
      ok: false,
      error: COMMENT_EMPTY,
    });
  });

  it("accepte tout juste la longueur maximale", () => {
    const res = validateCommentBody("a".repeat(MAX_COMMENT_LENGTH));
    expect(res.ok).toBe(true);
  });

  it("refuse un caractère de trop", () => {
    expect(validateCommentBody("a".repeat(MAX_COMMENT_LENGTH + 1))).toEqual({
      ok: false,
      error: COMMENT_TOO_LONG,
    });
  });

  it("mesure la longueur après nettoyage, pas avant", () => {
    // Sinon des espaces de bord suffiraient à faire refuser un texte valable.
    const res = validateCommentBody(`   ${"a".repeat(MAX_COMMENT_LENGTH)}   `);
    expect(res.ok).toBe(true);
  });
});

describe("libellés", () => {
  it("accorde les commentaires", () => {
    expect(describeComments(0)).toBe("Aucun commentaire");
    expect(describeComments(1)).toBe("1 commentaire");
    expect(describeComments(2)).toBe("2 commentaires");
  });

  it("laisse « j'aime » invariable", () => {
    expect(describeLikes(0)).toBe("Aucun j'aime");
    expect(describeLikes(1)).toBe("1 j'aime");
    expect(describeLikes(5)).toBe("5 j'aime");
  });
});
