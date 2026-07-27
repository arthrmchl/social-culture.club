import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks des dépendances non-pures (server-only + I/O) ---
const listFindFirst = vi.fn();
const listFindMany = vi.fn();
const listUpdate = vi.fn();
const workFindUnique = vi.fn();
const itemFindMany = vi.fn();
const itemCreateMany = vi.fn();
const itemUpdateMany = vi.fn();
const itemUpdate = vi.fn();
const itemDeleteMany = vi.fn();
const requireUser = vi.fn();
const revalidatePath = vi.fn();

const tx = {
  listItem: {
    findMany: (...a: unknown[]) => itemFindMany(...a),
    createMany: (...a: unknown[]) => itemCreateMany(...a),
    update: (...a: unknown[]) => itemUpdate(...a),
    deleteMany: (...a: unknown[]) => itemDeleteMany(...a),
  },
};

vi.mock("@/lib/db", () => ({
  db: {
    list: {
      findFirst: (...a: unknown[]) => listFindFirst(...a),
      findMany: (...a: unknown[]) => listFindMany(...a),
      update: (...a: unknown[]) => listUpdate(...a),
    },
    work: { findUnique: (...a: unknown[]) => workFindUnique(...a) },
    listItem: { updateMany: (...a: unknown[]) => itemUpdateMany(...a) },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));

vi.mock("@/lib/session", () => ({ requireUser: () => requireUser() }));

vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import {
  addToList,
  moveListItem,
  setListItemNote,
  togglePinList,
} from "./list";

const me = { id: "u1" };

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue(me);
});

describe("appartenance des listes", () => {
  // Les listes sont des données individuelles : chaque action doit se refermer
  // sur son propriétaire avant d'écrire quoi que ce soit.
  it("refuse d'ajouter à une liste qui n'est pas la mienne", async () => {
    listFindFirst.mockResolvedValue(null);

    expect(await addToList("l-autre", "w1")).toEqual({
      error: "Liste introuvable.",
    });
    expect(workFindUnique).not.toHaveBeenCalled();
    expect(itemCreateMany).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("filtre bien sur userId dans la requête", async () => {
    listFindFirst.mockResolvedValue({ id: "l1", slug: "ma-liste" });

    await togglePinList("l1");

    // togglePinList lit la liste par findFirst avec le userId.
    expect(listFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "l1", userId: "u1" },
      }),
    );
  });
});

describe("addToList", () => {
  it("refuse une œuvre inexistante", async () => {
    listFindFirst.mockResolvedValue({ id: "l1", slug: "ma-liste" });
    workFindUnique.mockResolvedValue(null);

    expect(await addToList("l1", "fantome")).toEqual({
      error: "Œuvre introuvable.",
    });
    expect(itemCreateMany).not.toHaveBeenCalled();
  });

  it("ajoute en fin de liste sans remonter un doublon", async () => {
    listFindFirst.mockResolvedValue({ id: "l1", slug: "ma-liste" });
    workFindUnique.mockResolvedValue({ id: "w1" });
    itemFindMany.mockResolvedValue([{ position: 0 }, { position: 1 }]);

    expect(await addToList("l1", "w1")).toEqual({ ok: true });

    expect(itemCreateMany).toHaveBeenCalledWith({
      data: [{ listId: "l1", workId: "w1", position: 2 }],
      skipDuplicates: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/listes/ma-liste");
  });
});

describe("moveListItem", () => {
  it("ne réécrit que les lignes dont la position change", async () => {
    listFindFirst.mockResolvedValue({ id: "l1", slug: "ma-liste" });
    itemFindMany.mockResolvedValue([
      { id: "i1", position: 0, workId: "wa" },
      { id: "i2", position: 1, workId: "wb" },
      { id: "i3", position: 2, workId: "wc" },
    ]);

    expect(await moveListItem("l1", "wc", 0)).toEqual({ ok: true });

    // wc passe en tête : les trois lignes bougent.
    expect(itemUpdate).toHaveBeenCalledTimes(3);
    expect(itemUpdate).toHaveBeenCalledWith({
      where: { id: "i3" },
      data: { position: 0 },
    });
  });

  it("n'écrit rien quand l'élément ne bouge pas", async () => {
    listFindFirst.mockResolvedValue({ id: "l1", slug: "ma-liste" });
    itemFindMany.mockResolvedValue([
      { id: "i1", position: 0, workId: "wa" },
      { id: "i2", position: 1, workId: "wb" },
    ]);

    await moveListItem("l1", "wb", 1);

    expect(itemUpdate).not.toHaveBeenCalled();
  });

  it("ignore une œuvre absente de la liste", async () => {
    listFindFirst.mockResolvedValue({ id: "l1", slug: "ma-liste" });
    itemFindMany.mockResolvedValue([{ id: "i1", position: 0, workId: "wa" }]);

    await moveListItem("l1", "inconnue", 0);

    expect(itemUpdate).not.toHaveBeenCalled();
  });
});

describe("setListItemNote", () => {
  it("normalise un commentaire vide en null", async () => {
    listFindFirst.mockResolvedValue({ id: "l1", slug: "ma-liste" });
    itemUpdateMany.mockResolvedValue({ count: 1 });

    expect(await setListItemNote("l1", "w1", "   ")).toEqual({ ok: true });

    expect(itemUpdateMany).toHaveBeenCalledWith({
      where: { listId: "l1", workId: "w1" },
      data: { note: null },
    });
  });

  it("signale un élément absent plutôt que de réussir en silence", async () => {
    listFindFirst.mockResolvedValue({ id: "l1", slug: "ma-liste" });
    itemUpdateMany.mockResolvedValue({ count: 0 });

    expect(await setListItemNote("l1", "w9", "bravo")).toEqual({
      error: "Élément introuvable.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuse un commentaire trop long", async () => {
    listFindFirst.mockResolvedValue({ id: "l1", slug: "ma-liste" });

    expect(await setListItemNote("l1", "w1", "x".repeat(2001))).toEqual({
      error: "Commentaire trop long.",
    });
    expect(itemUpdateMany).not.toHaveBeenCalled();
  });
});
