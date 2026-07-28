import { describe, expect, it } from "vitest";
import type { ProfileVisibility } from "@/generated/prisma/enums";
import {
  canSeeContent,
  resolveAccess,
  type AuthorProfile,
  type Relation,
  type Viewer,
} from "./visibility";

/**
 * Le test central du lot 4 : c'est ici, et nulle part ailleurs, qu'on se
 * convainc qu'un compte privé reste privé. Toutes les autres surfaces passent
 * par `resolveAccess` ; si elle est juste, elles le sont.
 */

const author = (over: Partial<AuthorProfile> = {}): AuthorProfile => ({
  id: "auteur",
  visibility: "PUBLIC",
  showJournalPublicly: true,
  showStatsPublicly: true,
  banned: false,
  ...over,
});

const rel = (over: Partial<Relation> = {}): Relation => ({
  isSelf: false,
  followsAuthor: false,
  blockEitherWay: false,
  ...over,
});

const ANON: Viewer = null;
const MEMBER: Viewer = { id: "membre", isAdmin: false };
const ADMIN: Viewer = { id: "admin", isAdmin: true };

describe("resolveAccess — visibilité du compte", () => {
  it("ouvre un compte PUBLIC à un visiteur déconnecté", () => {
    const a = resolveAccess(ANON, author({ visibility: "PUBLIC" }), rel());
    expect(a.canSeeProfile).toBe(true);
    expect(a.canSeeJournal).toBe(true);
    expect(a.reason).toBeNull();
  });

  it("ferme un compte MEMBERS à un visiteur déconnecté", () => {
    const a = resolveAccess(ANON, author({ visibility: "MEMBERS" }), rel());
    expect(a.canSeeProfile).toBe(false);
    expect(a.reason).toBe("members-only");
  });

  it("ouvre un compte MEMBERS à un membre connecté", () => {
    const a = resolveAccess(MEMBER, author({ visibility: "MEMBERS" }), rel());
    expect(a.canSeeProfile).toBe(true);
  });

  it("ferme un compte PRIVATE à un membre non abonné", () => {
    const a = resolveAccess(MEMBER, author({ visibility: "PRIVATE" }), rel());
    expect(a.canSeeProfile).toBe(false);
    expect(a.reason).toBe("private");
  });

  it("ferme un compte PRIVATE à un abonné en attente", () => {
    // `followsAuthor` ne vaut que pour un abonnement ACCEPTED : un PENDING
    // arrive donc ici avec false, et ne doit rien voir. C'est la raison d'être
    // du statut.
    const a = resolveAccess(
      MEMBER,
      author({ visibility: "PRIVATE" }),
      rel({ followsAuthor: false }),
    );
    expect(a.canSeeProfile).toBe(false);
  });

  it("ouvre un compte PRIVATE à un abonné accepté", () => {
    const a = resolveAccess(
      MEMBER,
      author({ visibility: "PRIVATE" }),
      rel({ followsAuthor: true }),
    );
    expect(a.canSeeProfile).toBe(true);
    expect(a.canSeeJournal).toBe(true);
  });
});

describe("resolveAccess — priorité des règles", () => {
  it("le blocage prime sur tout, y compris sur l'administrateur", () => {
    // Sinon le compte administrateur serait une porte dérobée à chaque
    // blocage. La modération passe par /moderation, pas par le profil.
    const a = resolveAccess(ADMIN, author(), rel({ blockEitherWay: true }));
    expect(a.canSeeProfile).toBe(false);
    expect(a.canInteract).toBe(false);
    expect(a.reason).toBe("blocked");
  });

  it("le blocage ferme un compte pourtant PUBLIC", () => {
    const a = resolveAccess(
      MEMBER,
      author({ visibility: "PUBLIC" }),
      rel({ blockEitherWay: true }),
    );
    expect(a.canSeeProfile).toBe(false);
  });

  it("on se voit toujours soi-même, même en compte privé", () => {
    const a = resolveAccess(
      MEMBER,
      author({ visibility: "PRIVATE", showJournalPublicly: false }),
      rel({ isSelf: true }),
    );
    expect(a.canSeeProfile).toBe(true);
    expect(a.canSeeJournal).toBe(true);
    expect(a.canSeeStats).toBe(true);
  });

  it("on n'interagit pas avec soi-même", () => {
    const a = resolveAccess(MEMBER, author(), rel({ isSelf: true }));
    expect(a.canInteract).toBe(false);
  });

  it("l'administrateur voit un compte privé auquel il n'est pas abonné", () => {
    const a = resolveAccess(ADMIN, author({ visibility: "PRIVATE" }), rel());
    expect(a.canSeeProfile).toBe(true);
    expect(a.canSeeJournal).toBe(true);
  });

  it("un compte banni n'est visible que de l'administrateur", () => {
    expect(
      resolveAccess(MEMBER, author({ banned: true }), rel()).canSeeProfile,
    ).toBe(false);
    expect(resolveAccess(MEMBER, author({ banned: true }), rel()).reason).toBe(
      "banned",
    );
    expect(
      resolveAccess(ADMIN, author({ banned: true }), rel()).canSeeProfile,
    ).toBe(true);
  });

  it("l'administrateur n'interagit pas avec un compte banni", () => {
    const a = resolveAccess(ADMIN, author({ banned: true }), rel());
    expect(a.canInteract).toBe(false);
  });
});

describe("resolveAccess — restrictions par section", () => {
  it("showJournalPublicly ferme le journal et les critiques, pas les listes", () => {
    const a = resolveAccess(
      MEMBER,
      author({ showJournalPublicly: false }),
      rel(),
    );
    expect(a.canSeeProfile).toBe(true);
    expect(a.canSeeJournal).toBe(false);
    expect(a.canSeeReviews).toBe(false);
    expect(a.canSeeLists).toBe(true);
    expect(a.canSeeStats).toBe(true);
  });

  it("showStatsPublicly n'affecte que les statistiques", () => {
    const a = resolveAccess(
      MEMBER,
      author({ showStatsPublicly: false }),
      rel(),
    );
    expect(a.canSeeStats).toBe(false);
    expect(a.canSeeJournal).toBe(true);
  });

  it("une section ne peut que restreindre, jamais élargir", () => {
    // Journal « public » sur un compte privé ne doit rien ouvrir.
    const a = resolveAccess(
      MEMBER,
      author({ visibility: "PRIVATE", showJournalPublicly: true }),
      rel(),
    );
    expect(a.canSeeJournal).toBe(false);
  });
});

describe("resolveAccess — interaction", () => {
  it("un visiteur déconnecté lit mais ne pose rien", () => {
    const a = resolveAccess(ANON, author({ visibility: "PUBLIC" }), rel());
    expect(a.canSeeProfile).toBe(true);
    expect(a.canInteract).toBe(false);
  });

  it("un membre connecté peut interagir avec un compte ouvert", () => {
    expect(resolveAccess(MEMBER, author(), rel()).canInteract).toBe(true);
  });

  it("un membre ne peut pas interagir avec un compte privé auquel il n'est pas abonné", () => {
    const a = resolveAccess(MEMBER, author({ visibility: "PRIVATE" }), rel());
    expect(a.canInteract).toBe(false);
  });
});

describe("resolveAccess — matrice complète", () => {
  const VISIBILITIES: ProfileVisibility[] = ["PUBLIC", "MEMBERS", "PRIVATE"];

  it("ne laisse jamais un visiteur bloqué voir quoi que ce soit", () => {
    for (const visibility of VISIBILITIES) {
      for (const viewer of [ANON, MEMBER, ADMIN]) {
        for (const follows of [false, true]) {
          const a = resolveAccess(
            viewer,
            author({ visibility }),
            rel({ blockEitherWay: true, followsAuthor: follows }),
          );
          expect(
            [
              a.canSeeProfile,
              a.canSeeJournal,
              a.canSeeLists,
              a.canSeeReviews,
              a.canSeeStats,
              a.canSeeFollowGraph,
              a.canInteract,
            ].some(Boolean),
          ).toBe(false);
        }
      }
    }
  });

  it("ne laisse jamais un déconnecté voir un compte non PUBLIC", () => {
    for (const visibility of ["MEMBERS", "PRIVATE"] as ProfileVisibility[]) {
      const a = resolveAccess(ANON, author({ visibility }), rel());
      expect(a.canSeeProfile).toBe(false);
    }
  });

  it("renseigne toujours reason quand l'accès est fermé, jamais quand il est ouvert", () => {
    for (const visibility of VISIBILITIES) {
      for (const viewer of [ANON, MEMBER, ADMIN]) {
        for (const banned of [false, true]) {
          const a = resolveAccess(viewer, author({ visibility, banned }), rel());
          expect(a.reason === null).toBe(a.canSeeProfile);
        }
      }
    }
  });
});

describe("canSeeContent", () => {
  const open = { canSeeProfile: true };
  const closed = { canSeeProfile: false };

  it("cache un contenu masqué par la modération", () => {
    expect(canSeeContent(open, { hiddenAt: new Date() }, false)).toBe(false);
  });

  it("montre son propre contenu masqué à son auteur", () => {
    // On ne fait pas disparaître un écrit sans le dire à celui qui l'a écrit :
    // la vue l'affiche coiffé d'un bandeau.
    expect(canSeeContent(closed, { hiddenAt: new Date() }, true)).toBe(true);
  });

  it("cache une liste que son auteur a rendue privée", () => {
    expect(canSeeContent(open, { hiddenAt: null, isPrivate: true }, false)).toBe(
      false,
    );
    expect(canSeeContent(open, { hiddenAt: null, isPrivate: true }, true)).toBe(
      true,
    );
  });

  it("montre un contenu ordinaire quand le profil est ouvert", () => {
    expect(canSeeContent(open, { hiddenAt: null, isPrivate: false }, false)).toBe(
      true,
    );
  });

  it("cache tout quand le profil est fermé", () => {
    expect(canSeeContent(closed, { hiddenAt: null }, false)).toBe(false);
  });

  it("traite isPrivate absent comme public", () => {
    // Les entrées de journal et les critiques n'ont pas de retrait par
    // l'auteur : seul le compte les protège.
    expect(canSeeContent(open, { hiddenAt: null }, false)).toBe(true);
  });
});
