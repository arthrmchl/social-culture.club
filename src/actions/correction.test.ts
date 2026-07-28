import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks des dépendances non-pures (server-only + I/O) ---
const workFindUnique = vi.fn();
const suggestionFindFirst = vi.fn();
const suggestionFindUnique = vi.fn();
const suggestionCreate = vi.fn();
const suggestionUpdate = vi.fn();
const requireUser = vi.fn();
const revalidatePath = vi.fn();
const notify = vi.fn();
const notifyAdmins = vi.fn();

const tx = {
  correctionSuggestion: { create: (...a: unknown[]) => suggestionCreate(...a) },
};

vi.mock("@/lib/db", () => ({
  db: {
    work: { findUnique: (...a: unknown[]) => workFindUnique(...a) },
    correctionSuggestion: {
      findFirst: (...a: unknown[]) => suggestionFindFirst(...a),
      findUnique: (...a: unknown[]) => suggestionFindUnique(...a),
      update: (...a: unknown[]) => suggestionUpdate(...a),
    },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

vi.mock("@/lib/session", () => ({
  requireUser: () => requireUser(),
  isAdmin: (u: { role?: string | null } | null) => u?.role === "admin",
}));

vi.mock("@/lib/social/notify", () => ({
  notify: (...a: unknown[]) => notify(...a),
  notifyAdmins: (...a: unknown[]) => notifyAdmins(...a),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

import { resolveCorrection, suggestCorrection } from "./correction";

const me = { id: "u1", role: "user" };

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue(me);
  workFindUnique.mockResolvedValue({
    id: "w1",
    titleFr: "Dune",
    createdById: "u2",
  });
  suggestionFindFirst.mockResolvedValue(null);
});

describe("suggestCorrection", () => {
  it("refuse un message vide", async () => {
    const res = await suggestCorrection("w1", undefined, form({ message: "" }));
    expect(res).toEqual({ error: "Décrivez la correction proposée." });
    expect(suggestionCreate).not.toHaveBeenCalled();
  });

  it("refuse une œuvre inexistante", async () => {
    workFindUnique.mockResolvedValue(null);
    const res = await suggestCorrection(
      "w1",
      undefined,
      form({ message: "1985." }),
    );
    expect(res).toEqual({ error: "Œuvre introuvable." });
  });

  it("refuse au créateur de se proposer une correction à lui-même", async () => {
    // Il édite : le bouton ne lui est d'ailleurs pas montré, mais l'action le
    // vérifie aussi — l'interface n'est pas une garantie.
    workFindUnique.mockResolvedValue({
      id: "w1",
      titleFr: "Dune",
      createdById: "u1",
    });

    const res = await suggestCorrection(
      "w1",
      undefined,
      form({ message: "1985." }),
    );
    expect(res).toEqual({
      error: "Cette fiche est la vôtre : modifiez-la directement.",
    });
    expect(suggestionCreate).not.toHaveBeenCalled();
  });

  it("refuse une seconde proposition ouverte du même auteur", async () => {
    suggestionFindFirst.mockResolvedValue({ id: "c1" });
    const res = await suggestCorrection(
      "w1",
      undefined,
      form({ message: "1985." }),
    );
    expect(res).toEqual({
      error: "Vous avez déjà une proposition en attente sur cette fiche.",
    });
  });

  it("notifie le créateur ET les administrateurs — D30 dit les deux", async () => {
    // Un créateur absent est précisément le cas que ce bouton doit couvrir
    // (R8) : ne prévenir que lui laisserait la fiche figée.
    const res = await suggestCorrection(
      "w1",
      undefined,
      form({ message: "L'année est 1985.", field: "année" }),
    );
    expect(res).toEqual({ success: true });

    expect(notify).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        userId: "u2",
        actorId: "u1",
        type: "CORRECTION",
        workId: "w1",
      }),
    );
    expect(notifyAdmins).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ type: "CORRECTION", except: ["u2"] }),
    );
  });

  it("écarte le créateur des administrateurs notifiés, pour éviter le doublon", async () => {
    await suggestCorrection("w1", undefined, form({ message: "1985." }));
    expect(notifyAdmins.mock.calls[0][1].except).toEqual(["u2"]);
  });

  it("normalise un champ vide en null", async () => {
    await suggestCorrection(
      "w1",
      undefined,
      form({ message: "1985.", field: "   " }),
    );
    expect(suggestionCreate.mock.calls[0][0].data.field).toBeNull();
  });
});

describe("resolveCorrection", () => {
  const suggestion = {
    id: "c1",
    status: "OPEN",
    workId: "w1",
    work: { createdById: "u2" },
  };

  it("autorise le créateur de la fiche", async () => {
    requireUser.mockResolvedValue({ id: "u2", role: "user" });
    suggestionFindUnique.mockResolvedValue(suggestion);

    expect(await resolveCorrection("c1", "APPLIED")).toEqual({ ok: true });
    expect(suggestionUpdate.mock.calls[0][0].data.status).toBe("APPLIED");
  });

  it("autorise l'administrateur", async () => {
    requireUser.mockResolvedValue({ id: "adm", role: "admin" });
    suggestionFindUnique.mockResolvedValue(suggestion);

    expect(await resolveCorrection("c1", "REJECTED")).toEqual({ ok: true });
  });

  it("refuse un tiers par « introuvable », sans rien écrire", async () => {
    suggestionFindUnique.mockResolvedValue(suggestion);

    expect(await resolveCorrection("c1", "APPLIED")).toEqual({
      error: "Proposition introuvable.",
    });
    expect(suggestionUpdate).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuse une proposition déjà traitée", async () => {
    requireUser.mockResolvedValue({ id: "u2", role: "user" });
    suggestionFindUnique.mockResolvedValue({
      ...suggestion,
      status: "APPLIED",
    });

    expect(await resolveCorrection("c1", "APPLIED")).toEqual({
      error: "Proposition déjà traitée.",
    });
    expect(suggestionUpdate).not.toHaveBeenCalled();
  });

  it("horodate et retient qui a traité", async () => {
    requireUser.mockResolvedValue({ id: "u2", role: "user" });
    suggestionFindUnique.mockResolvedValue(suggestion);
    await resolveCorrection("c1", "APPLIED");

    const data = suggestionUpdate.mock.calls[0][0].data;
    expect(data.handledById).toBe("u2");
    expect(data.handledAt).toBeInstanceOf(Date);
  });
});
