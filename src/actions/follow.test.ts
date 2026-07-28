import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks des dépendances non-pures (server-only + I/O) ---
const userFindUnique = vi.fn();
const followUpsert = vi.fn();
const followFindFirst = vi.fn();
const followUpdate = vi.fn();
const followDelete = vi.fn();
const followDeleteMany = vi.fn();
const requireUser = vi.fn();
const revalidatePath = vi.fn();
const assertCanInteract = vi.fn();
const notify = vi.fn();

const tx = {
  follow: {
    upsert: (...a: unknown[]) => followUpsert(...a),
    update: (...a: unknown[]) => followUpdate(...a),
  },
};

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    follow: {
      upsert: (...a: unknown[]) => followUpsert(...a),
      findFirst: (...a: unknown[]) => followFindFirst(...a),
      update: (...a: unknown[]) => followUpdate(...a),
      delete: (...a: unknown[]) => followDelete(...a),
      deleteMany: (...a: unknown[]) => followDeleteMany(...a),
    },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

vi.mock("@/lib/session", () => ({ requireUser: () => requireUser() }));

vi.mock("@/lib/social/guard", () => ({
  assertCanInteract: (...a: unknown[]) => assertCanInteract(...a),
}));

vi.mock("@/lib/social/notify", () => ({
  notify: (...a: unknown[]) => notify(...a),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

import {
  acceptFollowRequest,
  followUser,
  rejectFollowRequest,
  removeFollower,
  unfollowUser,
} from "./follow";

const me = { id: "u1" };

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue(me);
  assertCanInteract.mockResolvedValue({ ok: true });
  followDeleteMany.mockResolvedValue({ count: 1 });
});

describe("followUser", () => {
  it("refuse de s'abonner à soi-même, avant toute lecture", () => {
    // L'invariant followerId != followingId n'existe pas en base (Prisma ne
    // déclare pas de CHECK) : il vit ici, et nulle part ailleurs.
    return followUser("u1").then((res) => {
      expect(res).toEqual({ error: "On ne peut pas s'abonner à soi-même." });
      expect(userFindUnique).not.toHaveBeenCalled();
      expect(followUpsert).not.toHaveBeenCalled();
    });
  });

  it("crée un abonnement ACCEPTED sur un compte ouvert", async () => {
    userFindUnique.mockResolvedValue({
      id: "u2",
      username: "alice",
      visibility: "PUBLIC",
      banned: false,
    });

    expect(await followUser("u2")).toEqual({ ok: true });
    expect(followUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: "ACCEPTED" }),
      }),
    );
  });

  it("place la demande en PENDING sur un compte privé", async () => {
    userFindUnique.mockResolvedValue({
      id: "u2",
      username: "alice",
      visibility: "PRIVATE",
      banned: false,
    });

    expect(await followUser("u2")).toEqual({ ok: true });
    const call = followUpsert.mock.calls[0][0];
    expect(call.create.status).toBe("PENDING");
    expect(call.create.acceptedAt).toBeNull();
  });

  it("ne rétrograde pas un abonnement existant en attente", async () => {
    // `update: {}` — un second clic sur « Suivre » ne doit pas remettre en
    // attente un abonnement déjà accepté.
    userFindUnique.mockResolvedValue({
      id: "u2",
      username: "alice",
      visibility: "PRIVATE",
      banned: false,
    });
    await followUser("u2");
    expect(followUpsert.mock.calls[0][0].update).toEqual({});
  });

  it("refuse un compte banni", async () => {
    userFindUnique.mockResolvedValue({
      id: "u2",
      username: "alice",
      visibility: "PUBLIC",
      banned: true,
    });

    expect(await followUser("u2")).toEqual({ error: "Membre introuvable." });
    expect(followUpsert).not.toHaveBeenCalled();
  });

  it("refuse un membre inexistant", async () => {
    userFindUnique.mockResolvedValue(null);
    expect(await followUser("u2")).toEqual({ error: "Membre introuvable." });
  });

  it("s'arrête net quand la garde refuse — blocage, compte privé", async () => {
    userFindUnique.mockResolvedValue({
      id: "u2",
      username: "alice",
      visibility: "PUBLIC",
      banned: false,
    });
    assertCanInteract.mockResolvedValue({ error: "Refusé." });

    expect(await followUser("u2")).toEqual({ error: "Refusé." });
    expect(followUpsert).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("notifie FOLLOW sur un compte ouvert, FOLLOW_REQUEST sur un compte privé", async () => {
    // La notification est créée dans la transaction de l'abonnement : un
    // abonnement qui échoue ne doit pas annoncer un abonné inexistant.
    userFindUnique.mockResolvedValue({
      id: "u2",
      username: "alice",
      visibility: "PUBLIC",
      banned: false,
    });
    await followUser("u2");
    expect(notify).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ userId: "u2", actorId: "u1", type: "FOLLOW" }),
    );

    vi.clearAllMocks();
    requireUser.mockResolvedValue(me);
    assertCanInteract.mockResolvedValue({ ok: true });
    userFindUnique.mockResolvedValue({
      id: "u2",
      username: "alice",
      visibility: "PRIVATE",
      banned: false,
    });
    await followUser("u2");
    expect(notify).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ type: "FOLLOW_REQUEST" }),
    );
  });
});

describe("unfollowUser", () => {
  it("se désabonne sans erreur même si l'abonnement n'existe pas", async () => {
    // Se désabonner de ce à quoi on n'est pas abonné, c'est déjà l'état voulu.
    userFindUnique.mockResolvedValue({ username: "alice" });
    followDeleteMany.mockResolvedValue({ count: 0 });

    expect(await unfollowUser("u2")).toEqual({ ok: true });
    expect(followDeleteMany).toHaveBeenCalledWith({
      where: { followerId: "u1", followingId: "u2" },
    });
  });
});

describe("acceptFollowRequest", () => {
  it("filtre sur le destinataire, jamais sur le demandeur", async () => {
    // Sans ce filtre, un demandeur pourrait s'auto-approuver sur un compte
    // privé — le trou le plus évident du lot.
    followFindFirst.mockResolvedValue({ id: "f1" });
    await acceptFollowRequest("f1");

    expect(followFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "f1", followingId: "u1", status: "PENDING" },
      }),
    );
  });

  it("passe en ACCEPTED, horodate et prévient le demandeur", async () => {
    followFindFirst.mockResolvedValue({ id: "f1", followerId: "u9" });
    expect(await acceptFollowRequest("f1")).toEqual({ ok: true });

    const data = followUpdate.mock.calls[0][0].data;
    expect(data.status).toBe("ACCEPTED");
    expect(data.acceptedAt).toBeInstanceOf(Date);
    expect(notify).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ userId: "u9", type: "FOLLOW_ACCEPTED" }),
    );
  });

  it("refuse une demande qui ne m'est pas adressée, sans rien écrire", async () => {
    followFindFirst.mockResolvedValue(null);

    expect(await acceptFollowRequest("f1")).toEqual({
      error: "Demande introuvable.",
    });
    expect(followUpdate).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("rejectFollowRequest", () => {
  it("supprime la demande qui m'est adressée", async () => {
    followFindFirst.mockResolvedValue({ id: "f1" });
    expect(await rejectFollowRequest("f1")).toEqual({ ok: true });
    expect(followDelete).toHaveBeenCalledWith({ where: { id: "f1" } });
  });

  it("refuse une demande d'un autre, sans rien supprimer", async () => {
    followFindFirst.mockResolvedValue(null);

    expect(await rejectFollowRequest("f1")).toEqual({
      error: "Demande introuvable.",
    });
    expect(followDelete).not.toHaveBeenCalled();
  });
});

describe("removeFollower", () => {
  it("retire un abonné et filtre bien sur moi", async () => {
    expect(await removeFollower("u2")).toEqual({ ok: true });
    expect(followDeleteMany).toHaveBeenCalledWith({
      where: { followerId: "u2", followingId: "u1" },
    });
  });

  it("signale l'absence plutôt que de réussir en silence", async () => {
    followDeleteMany.mockResolvedValue({ count: 0 });
    expect(await removeFollower("u2")).toEqual({ error: "Abonné introuvable." });
  });
});
