import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks des dépendances non-pures (server-only + I/O) ---
const commentCreate = vi.fn();
const commentCount = vi.fn();
const commentFindFirst = vi.fn();
const commentFindUnique = vi.fn();
const commentUpdate = vi.fn();
const commentDelete = vi.fn();
const requireUser = vi.fn();
const revalidatePath = vi.fn();
const resolveInteractable = vi.fn();
const resolveTarget = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    comment: {
      create: (...a: unknown[]) => commentCreate(...a),
      count: (...a: unknown[]) => commentCount(...a),
      findFirst: (...a: unknown[]) => commentFindFirst(...a),
      findUnique: (...a: unknown[]) => commentFindUnique(...a),
      update: (...a: unknown[]) => commentUpdate(...a),
      delete: (...a: unknown[]) => commentDelete(...a),
    },
  },
}));

vi.mock("@/lib/session", () => ({
  requireUser: () => requireUser(),
  isAdmin: (u: { role?: string | null } | null) => u?.role === "admin",
}));

vi.mock("@/lib/social/guard", () => ({
  resolveInteractable: (...a: unknown[]) => resolveInteractable(...a),
  resolveTarget: (...a: unknown[]) => resolveTarget(...a),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

import { addComment, deleteComment, editComment } from "./comment";
import { MAX_COMMENT_LENGTH, MAX_COMMENTS_PER_MINUTE } from "@/lib/comments";

const me = { id: "u1", role: "user" };
const resolved = {
  target: { kind: "entry" as const, id: "e1" },
  ownerId: "u2",
  ownerUsername: "alice",
  hidden: false,
  label: "Dune",
  slug: null,
  workId: "w1",
  text: null,
};
const ENTRY = { kind: "entry" as const, id: "e1" };

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue(me);
  resolveInteractable.mockResolvedValue({ ok: true, resolved });
  resolveTarget.mockResolvedValue(resolved);
  commentCount.mockResolvedValue(0);
  commentCreate.mockResolvedValue({ id: "c1" });
});

describe("addComment — validation", () => {
  it("refuse un corps vide sans rien écrire", async () => {
    expect(await addComment(ENTRY, "   ")).toEqual({
      error: "Le commentaire ne peut pas être vide.",
    });
    expect(commentCreate).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuse un corps trop long", async () => {
    const res = await addComment(ENTRY, "a".repeat(MAX_COMMENT_LENGTH + 1));
    expect(res).toEqual({
      error: `Le commentaire ne peut pas dépasser ${MAX_COMMENT_LENGTH} caractères.`,
    });
    expect(commentCreate).not.toHaveBeenCalled();
  });

  it("refuse une cible malformée avant de valider le texte", async () => {
    const res = await addComment(
      // @ts-expect-error — cible bricolée côté client.
      { kind: "season", id: "s1" },
      "Bonjour",
    );
    expect(res).toEqual({ error: "Cible sociale inconnue." });
    expect(resolveInteractable).not.toHaveBeenCalled();
  });

  it("enregistre le corps nettoyé, pas le brut", async () => {
    await addComment(ENTRY, "  Très\r\njuste.  ");
    expect(commentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ body: "Très\njuste." }),
      }),
    );
  });

  it("écrit dans la seule colonne de la cible", async () => {
    await addComment({ kind: "review", id: "uw1" }, "Bien vu.");
    expect(commentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          journalEntryId: null,
          listId: null,
          userWorkId: "uw1",
        }),
      }),
    );
  });
});

describe("addComment — garde et débit", () => {
  it("s'arrête net quand la garde refuse", async () => {
    resolveInteractable.mockResolvedValue({ error: "Refusé." });

    expect(await addComment(ENTRY, "Bonjour")).toEqual({ error: "Refusé." });
    expect(commentCreate).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuse au-delà du plafond de débit", async () => {
    // Anti-spam technique, pas modération de contenu — D25 exclut tout
    // filtrage automatique du contenu lui-même.
    commentCount.mockResolvedValue(MAX_COMMENTS_PER_MINUTE);

    expect(await addComment(ENTRY, "Bonjour")).toEqual({
      error: "Vous publiez trop vite. Reprenez dans une minute.",
    });
    expect(commentCreate).not.toHaveBeenCalled();
  });

  it("accepte juste en dessous du plafond", async () => {
    commentCount.mockResolvedValue(MAX_COMMENTS_PER_MINUTE - 1);
    expect(await addComment(ENTRY, "Bonjour")).toEqual({ ok: true, id: "c1" });
  });
});

describe("editComment", () => {
  it("filtre sur l'auteur : on ne modifie que ses propres commentaires", async () => {
    commentFindFirst.mockResolvedValue({
      id: "c1",
      hiddenAt: null,
      journalEntryId: "e1",
      listId: null,
      userWorkId: null,
    });
    await editComment("c1", "Corrigé.");

    expect(commentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c1", authorId: "u1" } }),
    );
  });

  it("refuse le commentaire d'un autre, sans rien écrire", async () => {
    commentFindFirst.mockResolvedValue(null);

    expect(await editComment("c1", "Corrigé.")).toEqual({
      error: "Commentaire introuvable.",
    });
    expect(commentUpdate).not.toHaveBeenCalled();
  });

  it("refuse de réécrire un commentaire masqué — ce serait défaire la modération", async () => {
    commentFindFirst.mockResolvedValue({
      id: "c1",
      hiddenAt: new Date(),
      journalEntryId: "e1",
      listId: null,
      userWorkId: null,
    });

    expect(await editComment("c1", "Corrigé.")).toEqual({
      error: "Ce commentaire a été masqué par la modération.",
    });
    expect(commentUpdate).not.toHaveBeenCalled();
  });
});

describe("deleteComment — les trois qualités qui l'autorisent", () => {
  const row = {
    id: "c1",
    authorId: "u9",
    journalEntryId: "e1",
    listId: null,
    userWorkId: null,
  };

  it("l'auteur du commentaire", async () => {
    commentFindUnique.mockResolvedValue({ ...row, authorId: "u1" });
    expect(await deleteComment("c1")).toEqual({ ok: true });
    expect(commentDelete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });

  it("le propriétaire du contenu commenté — faire le ménage chez soi", async () => {
    commentFindUnique.mockResolvedValue(row);
    resolveTarget.mockResolvedValue({ ...resolved, ownerId: "u1" });

    expect(await deleteComment("c1")).toEqual({ ok: true });
    expect(commentDelete).toHaveBeenCalled();
  });

  it("l'administrateur", async () => {
    requireUser.mockResolvedValue({ id: "adm", role: "admin" });
    commentFindUnique.mockResolvedValue(row);

    expect(await deleteComment("c1")).toEqual({ ok: true });
    expect(commentDelete).toHaveBeenCalled();
  });

  it("refuse un tiers, sans rien supprimer", async () => {
    commentFindUnique.mockResolvedValue(row);
    resolveTarget.mockResolvedValue({ ...resolved, ownerId: "u2" });

    expect(await deleteComment("c1")).toEqual({
      error: "Commentaire introuvable.",
    });
    expect(commentDelete).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuse un commentaire inexistant", async () => {
    commentFindUnique.mockResolvedValue(null);
    expect(await deleteComment("c1")).toEqual({
      error: "Commentaire introuvable.",
    });
  });
});
