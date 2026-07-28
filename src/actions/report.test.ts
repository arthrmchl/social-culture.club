import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks des dépendances non-pures (server-only + I/O) ---
const reportFindFirst = vi.fn();
const reportFindUnique = vi.fn();
const reportCreate = vi.fn();
const reportUpdate = vi.fn();
const entryUpdate = vi.fn();
const entryDelete = vi.fn();
const userWorkUpdate = vi.fn();
const commentFindUnique = vi.fn();
const requireUser = vi.fn();
const revalidatePath = vi.fn();
const resolveTarget = vi.fn();
const notify = vi.fn();

const tx = {
  journalEntry: {
    update: (...a: unknown[]) => entryUpdate(...a),
    delete: (...a: unknown[]) => entryDelete(...a),
  },
  userWork: { update: (...a: unknown[]) => userWorkUpdate(...a) },
  report: { update: (...a: unknown[]) => reportUpdate(...a) },
};

vi.mock("@/lib/db", () => ({
  db: {
    report: {
      findFirst: (...a: unknown[]) => reportFindFirst(...a),
      findUnique: (...a: unknown[]) => reportFindUnique(...a),
      create: (...a: unknown[]) => reportCreate(...a),
    },
    comment: { findUnique: (...a: unknown[]) => commentFindUnique(...a) },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

vi.mock("@/lib/session", () => ({
  requireUser: () => requireUser(),
  isAdmin: (u: { role?: string | null } | null) => u?.role === "admin",
}));

vi.mock("@/lib/social/guard", () => ({
  resolveTarget: (...a: unknown[]) => resolveTarget(...a),
}));

vi.mock("@/lib/social/notify", () => ({
  notify: (...a: unknown[]) => notify(...a),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

import { reportContent, resolveReport } from "./report";

const me = { id: "u1", role: "user" };
const ADMIN = { id: "adm", role: "admin" };
const ENTRY = { kind: "entry" as const, id: "e1" };
const resolved = {
  target: ENTRY,
  ownerId: "u2",
  ownerUsername: "alice",
  hidden: false,
  label: "Dune",
  slug: null,
  workId: "w1",
  text: "**Un texte** avec du [markdown](https://exemple.fr).",
};

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue(me);
  resolveTarget.mockResolvedValue(resolved);
  reportFindFirst.mockResolvedValue(null);
});

describe("reportContent", () => {
  it("refuse un motif inconnu", async () => {
    const res = await reportContent({ target: ENTRY, reason: "BOF" });
    expect(res).toEqual({ error: "Motif de signalement inconnu." });
    expect(reportCreate).not.toHaveBeenCalled();
  });

  it("refuse une cible malformée avant tout le reste", async () => {
    const res = await reportContent({
      // @ts-expect-error — cible bricolée côté client.
      target: { kind: "season", id: "s1" },
      reason: "SPAM",
    });
    expect(res).toEqual({ error: "Cible sociale inconnue." });
    expect(resolveTarget).not.toHaveBeenCalled();
  });

  it("refuse de signaler son propre contenu", async () => {
    resolveTarget.mockResolvedValue({ ...resolved, ownerId: "u1" });
    const res = await reportContent({ target: ENTRY, reason: "SPAM" });
    expect(res).toEqual({
      error: "Vous ne pouvez pas signaler votre propre contenu.",
    });
    expect(reportCreate).not.toHaveBeenCalled();
  });

  it("refuse un doublon ouvert du même rapporteur", async () => {
    // L'unicité « un signalement ouvert par rapporteur et par cible » n'est pas
    // déclarable en base : reporterId est nullable, et deux rapporteurs
    // supprimés produiraient deux NULL considérés distincts.
    reportFindFirst.mockResolvedValue({ id: "r1" });

    expect(await reportContent({ target: ENTRY, reason: "SPAM" })).toEqual({
      error: "Vous avez déjà signalé ce contenu.",
    });
    expect(reportCreate).not.toHaveBeenCalled();
  });

  it("cherche le doublon sur les trois colonnes et le statut OPEN", async () => {
    await reportContent({ target: ENTRY, reason: "SPAM" });
    expect(reportFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          reporterId: "u1",
          status: "OPEN",
          journalEntryId: "e1",
          listId: null,
          userWorkId: null,
        },
      }),
    );
  });

  it("fige l'instantané : nature, libellé et extrait sans markdown", async () => {
    // Les FK sont en SetNull : après suppression du contenu, c'est tout ce qui
    // reste pour comprendre ce qui avait été signalé.
    await reportContent({ target: ENTRY, reason: "SPOILER" });

    const data = reportCreate.mock.calls[0][0].data;
    expect(data.targetKind).toBe("JOURNAL_ENTRY");
    expect(data.targetLabel).toBe("Dune");
    expect(data.targetExcerpt).toBe("Un texte avec du markdown.");
    expect(data.reportedUserId).toBe("u2");
  });

  it("normalise des précisions vides en null", async () => {
    await reportContent({ target: ENTRY, reason: "SPAM", details: "   " });
    expect(reportCreate.mock.calls[0][0].data.details).toBeNull();
  });
});

describe("resolveReport — réservé à l'administration", () => {
  it("refuse un non-administrateur avant même de lire le signalement", async () => {
    // Un refus après lecture apprendrait l'existence du signalement.
    expect(await resolveReport("r1", "HIDE")).toEqual({
      error: "Réservé à l'administration.",
    });
    expect(reportFindUnique).not.toHaveBeenCalled();
  });

  it("refuse un signalement déjà traité", async () => {
    requireUser.mockResolvedValue(ADMIN);
    reportFindUnique.mockResolvedValue({
      id: "r1",
      status: "ACCEPTED",
      targetKind: "JOURNAL_ENTRY",
    });

    expect(await resolveReport("r1", "HIDE")).toEqual({
      error: "Signalement déjà traité.",
    });
    expect(reportUpdate).not.toHaveBeenCalled();
  });
});

describe("resolveReport — décisions", () => {
  const open = {
    id: "r1",
    status: "OPEN",
    targetKind: "JOURNAL_ENTRY",
    journalEntryId: "e1",
    listId: null,
    userWorkId: null,
    commentId: null,
    reportedUserId: "u2",
  };

  beforeEach(() => {
    requireUser.mockResolvedValue(ADMIN);
    reportFindUnique.mockResolvedValue(open);
  });

  it("HIDE masque le contenu et prévient son auteur", async () => {
    expect(await resolveReport("r1", "HIDE")).toEqual({ ok: true });

    expect(entryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "e1" } }),
    );
    expect(entryDelete).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      tx,
      // Notification système : pas d'acteur, l'administration n'est pas un
      // interlocuteur qu'on puisse suivre ou bloquer.
      expect.objectContaining({
        userId: "u2",
        actorId: null,
        type: "MODERATION",
      }),
    );
    expect(reportUpdate.mock.calls[0][0].data.status).toBe("ACCEPTED");
  });

  it("DELETE supprime le contenu — le signalement, lui, survit", async () => {
    expect(await resolveReport("r1", "DELETE")).toEqual({ ok: true });
    expect(entryDelete).toHaveBeenCalledWith({ where: { id: "e1" } });
    expect(reportUpdate.mock.calls[0][0].data.status).toBe("ACCEPTED");
  });

  it("REJECT ferme sans toucher au contenu ni notifier", async () => {
    expect(await resolveReport("r1", "REJECT")).toEqual({ ok: true });
    expect(entryUpdate).not.toHaveBeenCalled();
    expect(entryDelete).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(reportUpdate.mock.calls[0][0].data.status).toBe("REJECTED");
  });

  it("une critique se masque, jamais ne se supprime", async () => {
    // Le UserWork porte aussi le statut, la note et la progression du membre :
    // la modération ne touche pas au suivi personnel.
    reportFindUnique.mockResolvedValue({
      ...open,
      targetKind: "REVIEW",
      journalEntryId: null,
      userWorkId: "uw1",
    });

    await resolveReport("r1", "DELETE");
    expect(userWorkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "uw1" } }),
    );
  });

  it("horodate la décision et retient la note de l'administrateur", async () => {
    await resolveReport("r1", "HIDE", "  Récidive.  ");
    const data = reportUpdate.mock.calls[0][0].data;
    expect(data.resolvedById).toBe("adm");
    expect(data.resolvedAt).toBeInstanceOf(Date);
    expect(data.resolution).toBe("Récidive.");
  });
});
