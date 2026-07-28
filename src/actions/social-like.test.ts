import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks des dépendances non-pures (server-only + I/O) ---
const likeFindFirst = vi.fn();
const likeCreate = vi.fn();
const likeDelete = vi.fn();
const likeCount = vi.fn();
const requireUser = vi.fn();
const revalidatePath = vi.fn();
const resolveInteractable = vi.fn();

const tx = {
  socialLike: {
    findFirst: (...a: unknown[]) => likeFindFirst(...a),
    create: (...a: unknown[]) => likeCreate(...a),
    delete: (...a: unknown[]) => likeDelete(...a),
    count: (...a: unknown[]) => likeCount(...a),
  },
};

vi.mock("@/lib/db", () => ({
  db: { $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) },
}));

vi.mock("@/lib/session", () => ({ requireUser: () => requireUser() }));

vi.mock("@/lib/social/guard", () => ({
  resolveInteractable: (...a: unknown[]) => resolveInteractable(...a),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

import { toggleSocialLike } from "./social-like";

const me = { id: "u1" };
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

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue(me);
  resolveInteractable.mockResolvedValue({ ok: true, resolved });
  likeCount.mockResolvedValue(1);
});

describe("toggleSocialLike — validation de la cible", () => {
  it("refuse une nature inconnue avant toute lecture", async () => {
    const res = await toggleSocialLike({
      // @ts-expect-error — on simule une cible bricolée côté client.
      kind: "season",
      id: "s1",
    });
    expect(res).toEqual({ error: "Cible sociale inconnue." });
    expect(resolveInteractable).not.toHaveBeenCalled();
    expect(likeCreate).not.toHaveBeenCalled();
  });

  it("refuse un identifiant vide", async () => {
    const res = await toggleSocialLike({ kind: "entry", id: "" });
    expect(res).toEqual({ error: "Cible sociale invalide." });
    expect(likeCreate).not.toHaveBeenCalled();
  });
});

describe("toggleSocialLike — garde", () => {
  it("s'arrête net quand la cible est masquée ou l'accès refusé", async () => {
    resolveInteractable.mockResolvedValue({ error: "Contenu introuvable." });

    expect(await toggleSocialLike({ kind: "entry", id: "e1" })).toEqual({
      error: "Contenu introuvable.",
    });
    expect(likeCreate).not.toHaveBeenCalled();
    expect(likeDelete).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("toggleSocialLike — bascule", () => {
  it("pose un j'aime dans la seule colonne de la cible", async () => {
    likeFindFirst.mockResolvedValue(null);
    likeCount.mockResolvedValue(3);

    const res = await toggleSocialLike({ kind: "entry", id: "e1" });
    expect(res).toEqual({ ok: true, liked: true, count: 3 });

    // L'invariant « exactement une colonne renseignée » ne tient que si toutes
    // les écritures passent par targetColumns.
    expect(likeCreate).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        journalEntryId: "e1",
        listId: null,
        userWorkId: null,
      },
    });
  });

  it("retire un j'aime existant", async () => {
    likeFindFirst.mockResolvedValue({ id: "sl1" });
    likeCount.mockResolvedValue(0);

    const res = await toggleSocialLike({ kind: "entry", id: "e1" });
    expect(res).toEqual({ ok: true, liked: false, count: 0 });
    expect(likeDelete).toHaveBeenCalledWith({ where: { id: "sl1" } });
    expect(likeCreate).not.toHaveBeenCalled();
  });

  it("cherche l'existant sur la seule colonne concernée", async () => {
    // Pas de comparaison à null sur les deux autres : Prisma se pose alors sur
    // l'index dédié.
    likeFindFirst.mockResolvedValue(null);
    await toggleSocialLike({ kind: "list", id: "l1" });

    expect(likeFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", listId: "l1" } }),
    );
  });

  it("place une critique dans userWorkId", async () => {
    likeFindFirst.mockResolvedValue(null);
    await toggleSocialLike({ kind: "review", id: "uw1" });

    expect(likeCreate).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        journalEntryId: null,
        listId: null,
        userWorkId: "uw1",
      },
    });
  });

  it("renvoie le compte recalculé côté serveur, pas un incrément local", async () => {
    // Deux onglets ouverts divergeraient sinon.
    likeFindFirst.mockResolvedValue(null);
    likeCount.mockResolvedValue(42);
    expect(await toggleSocialLike({ kind: "entry", id: "e1" })).toMatchObject({
      count: 42,
    });
  });
});
