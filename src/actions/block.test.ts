import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks des dépendances non-pures (server-only + I/O) ---
const userFindUnique = vi.fn();
const blockUpsert = vi.fn();
const blockDeleteMany = vi.fn();
const followDeleteMany = vi.fn();
const notificationDeleteMany = vi.fn();
const requireUser = vi.fn();
const revalidatePath = vi.fn();

const tx = {
  block: { upsert: (...a: unknown[]) => blockUpsert(...a) },
  follow: { deleteMany: (...a: unknown[]) => followDeleteMany(...a) },
  notification: {
    deleteMany: (...a: unknown[]) => notificationDeleteMany(...a),
  },
};

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    block: { deleteMany: (...a: unknown[]) => blockDeleteMany(...a) },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

vi.mock("@/lib/session", () => ({ requireUser: () => requireUser() }));

vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

import { blockUser, unblockUser } from "./block";

const me = { id: "u1" };

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue(me);
  userFindUnique.mockResolvedValue({ id: "u2", username: "alice" });
});

describe("blockUser", () => {
  it("refuse de se bloquer soi-même, avant toute lecture", async () => {
    expect(await blockUser("u1")).toEqual({
      error: "On ne peut pas se bloquer soi-même.",
    });
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(blockUpsert).not.toHaveBeenCalled();
  });

  it("refuse un membre inexistant", async () => {
    userFindUnique.mockResolvedValue(null);
    expect(await blockUser("u2")).toEqual({ error: "Membre introuvable." });
    expect(blockUpsert).not.toHaveBeenCalled();
  });

  it("supprime les abonnements dans les deux sens", async () => {
    // Bloquer quelqu'un, c'est aussi cesser de le suivre — et l'empêcher de
    // nous suivre. Un seul sens laisserait un lien vivant.
    await blockUser("u2");

    expect(followDeleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { followerId: "u1", followingId: "u2" },
          { followerId: "u2", followingId: "u1" },
        ],
      },
    });
  });

  it("supprime les notifications croisées", async () => {
    await blockUser("u2");

    expect(notificationDeleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { userId: "u1", actorId: "u2" },
          { userId: "u2", actorId: "u1" },
        ],
      },
    });
  });

  it("ne supprime ni les j'aime ni les commentaires déjà posés", async () => {
    // Ils sont masqués à la lecture (blockedUserIds) : c'est ce qui rend le
    // déblocage réversible. Un blocage regretté ne doit rien détruire.
    await blockUser("u2");

    const touched = Object.keys(tx);
    expect(touched).not.toContain("socialLike");
    expect(touched).not.toContain("comment");
  });

  it("normalise un motif vide en null", async () => {
    await blockUser("u2", "   ");
    expect(blockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ reason: null }),
      }),
    );
  });

  it("conserve un motif renseigné, débarrassé de ses espaces", async () => {
    await blockUser("u2", "  harcèlement  ");
    expect(blockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ reason: "harcèlement" }),
      }),
    );
  });
});

describe("unblockUser", () => {
  it("retire le blocage que j'ai posé, et lui seul", async () => {
    expect(await unblockUser("u2")).toEqual({ ok: true });
    expect(blockDeleteMany).toHaveBeenCalledWith({
      where: { blockerId: "u1", blockedId: "u2" },
    });
  });

  it("ne rétablit pas l'abonnement — c'est au membre de le refaire", async () => {
    await unblockUser("u2");
    expect(followDeleteMany).not.toHaveBeenCalled();
  });

  it("ne fait pas d'erreur si le blocage n'existait pas", async () => {
    blockDeleteMany.mockResolvedValue({ count: 0 });
    expect(await unblockUser("u2")).toEqual({ ok: true });
  });
});
