import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks des dépendances non-pures (server-only + I/O) ---
const workFindUnique = vi.fn();
const editionFindUnique = vi.fn();
const progressCreate = vi.fn();
const userWorkFindUnique = vi.fn();
const userWorkUpsert = vi.fn();
const requireUser = vi.fn();

vi.mock("@/lib/db", () => {
  const tx = {
    readingProgress: { create: (...a: unknown[]) => progressCreate(...a) },
    userWork: {
      findUnique: (...a: unknown[]) => userWorkFindUnique(...a),
      upsert: (...a: unknown[]) => userWorkUpsert(...a),
    },
  };
  return {
    db: {
      work: { findUnique: (...a: unknown[]) => workFindUnique(...a) },
      edition: { findUnique: (...a: unknown[]) => editionFindUnique(...a) },
      $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

vi.mock("@/lib/session", () => ({
  requireUser: () => requireUser(),
  isAdmin: () => false,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateReadingProgress } from "./status";

const user = { id: "u1", role: "user" };

describe("updateReadingProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue(user);
    userWorkFindUnique.mockResolvedValue(null);
  });

  it("refuse une progression de livre sans édition désignée", async () => {
    workFindUnique.mockResolvedValue({ type: "BOOK" });

    const res = await updateReadingProgress("w1", { page: 150 });

    expect(res).toEqual({
      error: "Précisez d'abord l'édition que vous lisez.",
    });
    expect(progressCreate).not.toHaveBeenCalled();
  });

  it("refuse une édition qui n'est pas celle de l'œuvre", async () => {
    workFindUnique.mockResolvedValue({ type: "BOOK" });
    editionFindUnique.mockResolvedValue({ workId: "autre" });

    const res = await updateReadingProgress("w1", {
      page: 150,
      editionId: "e-ailleurs",
    });

    expect(res).toEqual({ error: "Édition introuvable." });
    expect(progressCreate).not.toHaveBeenCalled();
  });

  it("historise la progression avec son édition", async () => {
    workFindUnique.mockResolvedValue({ type: "BOOK" });
    editionFindUnique.mockResolvedValue({ workId: "w1" });

    const res = await updateReadingProgress("w1", {
      page: 150,
      editionId: "e-poche",
    });

    expect(res).toEqual({ ok: true });
    expect(progressCreate).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        workId: "w1",
        editionId: "e-poche",
        page: 150,
        percent: null,
      },
    });
  });

  it("n'exige rien d'un média qui ne se suit pas à la page", async () => {
    // Une série se suit à l'épisode : le pourcentage reste possible sans
    // édition, qui n'aurait ici aucun sens.
    workFindUnique.mockResolvedValue({ type: "SERIES" });

    const res = await updateReadingProgress("w1", { percent: 40 });

    expect(res).toEqual({ ok: true });
    expect(editionFindUnique).not.toHaveBeenCalled();
    expect(progressCreate).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        workId: "w1",
        editionId: null,
        page: null,
        percent: 40,
      },
    });
  });

  it("refuse une œuvre introuvable", async () => {
    workFindUnique.mockResolvedValue(null);

    const res = await updateReadingProgress("inconnu", { page: 1 });

    expect(res).toEqual({ error: "Œuvre introuvable." });
  });
});
