import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks des dépendances non-pures (server-only + I/O) ---
const findUnique = vi.fn();
const deleteWorkRow = vi.fn();
const requireUser = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    work: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      delete: (...args: unknown[]) => deleteWorkRow(...args),
    },
  },
}));

vi.mock("@/lib/session", () => ({
  requireUser: () => requireUser(),
  // implémentation réelle : admin = rôle "admin"
  isAdmin: (u: { role?: string | null } | null | undefined) =>
    u?.role === "admin",
}));

vi.mock("@/lib/search", () => ({ findDuplicateWorks: vi.fn() }));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

// redirect() de Next interrompt l'exécution en lançant : on simule ce contrat.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import { deleteWork } from "./work";

const admin = { id: "u-admin", role: "admin" };
const member = { id: "u-member", role: "user" };

describe("deleteWork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuse un utilisateur non-admin sans rien supprimer", async () => {
    requireUser.mockResolvedValue(member);

    const result = await deleteWork("w1");

    expect(result).toEqual({
      error: "Seul l'administrateur peut supprimer une fiche.",
    });
    expect(findUnique).not.toHaveBeenCalled();
    expect(deleteWorkRow).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("renvoie une erreur si la fiche est introuvable", async () => {
    requireUser.mockResolvedValue(admin);
    findUnique.mockResolvedValue(null);

    const result = await deleteWork("inconnu");

    expect(result).toEqual({ error: "Fiche introuvable." });
    expect(deleteWorkRow).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("supprime la fiche puis redirige vers le catalogue pour un admin", async () => {
    requireUser.mockResolvedValue(admin);
    findUnique.mockResolvedValue({ id: "w1" });

    // redirect() lève NEXT_REDIRECT : c'est le chemin de succès.
    await expect(deleteWork("w1")).rejects.toThrow("NEXT_REDIRECT:/catalogue");

    expect(deleteWorkRow).toHaveBeenCalledWith({ where: { id: "w1" } });
    expect(revalidatePath).toHaveBeenCalledWith("/catalogue");
  });
});
