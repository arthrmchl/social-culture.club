import { describe, expect, it } from "vitest";
import {
  socialTargetSchema,
  targetColumns,
  targetFromColumns,
  targetHref,
  targetWhere,
  TARGET_LABELS,
  type SocialTarget,
} from "./social-target";

const ENTRY: SocialTarget = { kind: "entry", id: "e1" };
const LIST: SocialTarget = { kind: "list", id: "l1" };
const REVIEW: SocialTarget = { kind: "review", id: "uw1" };

describe("targetColumns", () => {
  it("ne renseigne qu'une colonne sur trois", () => {
    for (const target of [ENTRY, LIST, REVIEW]) {
      const cols = targetColumns(target);
      const set = Object.values(cols).filter((v) => v !== null);
      expect(set).toEqual([target.id]);
    }
  });

  it("place chaque nature dans sa colonne", () => {
    expect(targetColumns(ENTRY).journalEntryId).toBe("e1");
    expect(targetColumns(LIST).listId).toBe("l1");
    expect(targetColumns(REVIEW).userWorkId).toBe("uw1");
  });
});

describe("targetWhere", () => {
  it("ne compare qu'une colonne — pas de null explicite qui écarterait l'index", () => {
    expect(targetWhere(ENTRY)).toEqual({ journalEntryId: "e1" });
    expect(targetWhere(LIST)).toEqual({ listId: "l1" });
    expect(targetWhere(REVIEW)).toEqual({ userWorkId: "uw1" });
  });
});

describe("targetFromColumns", () => {
  it("fait l'aller-retour pour les trois natures", () => {
    for (const target of [ENTRY, LIST, REVIEW]) {
      expect(targetFromColumns(targetColumns(target))).toEqual(target);
    }
  });

  it("lève quand aucune colonne n'est renseignée", () => {
    expect(() =>
      targetFromColumns({
        journalEntryId: null,
        listId: null,
        userWorkId: null,
      }),
    ).toThrow(/incohérente/);
  });

  it("lève quand deux colonnes le sont — l'invariant que la base ne tient pas", () => {
    expect(() =>
      targetFromColumns({ journalEntryId: "e1", listId: "l1" }),
    ).toThrow(/2 colonne/);
  });

  it("lève sur un objet vide", () => {
    expect(() => targetFromColumns({})).toThrow();
  });
});

describe("socialTargetSchema", () => {
  it("accepte les trois natures", () => {
    for (const target of [ENTRY, LIST, REVIEW]) {
      expect(socialTargetSchema.safeParse(target).success).toBe(true);
    }
  });

  it("refuse une nature inconnue avec un message français", () => {
    const res = socialTargetSchema.safeParse({ kind: "season", id: "s1" });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe("Cible sociale inconnue.");
    }
  });

  it("refuse un identifiant vide", () => {
    const res = socialTargetSchema.safeParse({ kind: "entry", id: "" });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe("Cible sociale invalide.");
    }
  });
});

describe("targetHref", () => {
  const ctx = { username: "alice" };

  it("construit le permalien d'une entrée de journal", () => {
    expect(targetHref(ENTRY, ctx)).toBe("/u/alice/journal/e1");
  });

  it("construit le permalien d'une liste à partir de son slug, pas de son id", () => {
    // Les URL de listes sont slugées depuis le lot 3 : le permalien social doit
    // désigner le même écran que /listes/<slug>.
    expect(targetHref(LIST, { ...ctx, slug: "mes-indispensables" })).toBe(
      "/u/alice/listes/mes-indispensables",
    );
  });

  it("construit le permalien d'une critique à partir de l'œuvre", () => {
    expect(targetHref(REVIEW, { ...ctx, workId: "w1" })).toBe(
      "/u/alice/critique/w1",
    );
  });

  it("renvoie null plutôt qu'une URL cassée quand le contexte manque", () => {
    // Cas réel : la file de modération affiche un signalement dont le contenu a
    // été supprimé. On veut le libellé sans lien, pas un lien mort.
    expect(targetHref(LIST, ctx)).toBeNull();
    expect(targetHref(REVIEW, ctx)).toBeNull();
    expect(targetHref(ENTRY, { username: "" })).toBeNull();
  });
});

describe("TARGET_LABELS", () => {
  it("nomme les trois natures en français", () => {
    expect(TARGET_LABELS.entry).toBe("entrée de journal");
    expect(TARGET_LABELS.list).toBe("liste");
    expect(TARGET_LABELS.review).toBe("critique");
  });
});
