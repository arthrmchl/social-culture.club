import "server-only";

import { db } from "@/lib/db";
import { resolveCovers } from "@/lib/cover-loader";
import { canSeeContent } from "@/lib/visibility";
import {
  targetHref,
  targetWhere,
  type SocialTarget,
} from "@/lib/social-target";
import type { NotificationType, WorkType } from "@/generated/prisma/enums";
import { blockedUserIds, isOwnerOrAdmin, type AccessTo } from "./access";
import { accessTo, accessToUsername, getViewer } from "./viewer";

/**
 * La porte de lecture publique (lot 4, P1) — **le seul** module qui lise le
 * contenu d'autrui.
 *
 * Trois principes, dont dépend tout le lot :
 *
 * 1. **Renvoyer `null` plutôt qu'un objet partiel.** Une page qui oublierait de
 *    vérifier l'accès n'a alors rien à afficher : on ne peut pas oublier une
 *    vérification qui produit la donnée elle-même. L'appelant fait
 *    `notFound()`.
 * 2. **`notFound()` et jamais 403.** Un profil privé, bloqué ou banni rend la
 *    même page introuvable qu'un pseudonyme inexistant. Un 403 confirmerait
 *    l'existence du compte — et pour un blocage, dirait au bloqué qu'il l'est.
 * 3. **Filtrer `hiddenAt` et les comptes bloqués partout.** Ces deux filtres
 *    n'apparaissent que dans ce fichier ; la règle ESLint sur
 *    `src/app/(public)/**` interdit à une page de lire la base sans passer par
 *    ici.
 *
 * Chaque fonction renvoie un type `XData` prêt pour les composants : une page
 * ne voit jamais une ligne Prisma brute.
 */

const WORK_SELECT = {
  id: true,
  type: true,
  titleFr: true,
  year: true,
  coverImageId: true,
} as const;

export type PublicWork = {
  id: string;
  type: WorkType;
  titleFr: string;
  year: number | null;
  coverImageId: string | null;
};

/**
 * Les couvertures d'un lot d'œuvres vues **du point de vue de l'auteur** : sur
 * son profil comme dans le fil, c'est l'édition qu'*il* lit qui illustre son
 * étagère, pas celle du visiteur (lot 5).
 */
async function authorCovers(works: PublicWork[], authorId: string) {
  const covers = await resolveCovers(works, authorId);
  return <T extends PublicWork>(work: T): T => ({
    ...work,
    coverImageId: covers.get(work.id),
  });
}

export type ProfileViewData = {
  access: AccessTo;
  favorites: PublicWork[];
  counts: { works: number; entries: number; lists: number };
  pinnedLists: { id: string; title: string; slug: string; items: number }[];
  /** Abonnés et abonnements — masqués si `canSeeFollowGraph` est faux. */
  follows: { followers: number; following: number } | null;
  /** L'abonnement du visiteur vers cet auteur, pour le bouton « Suivre ». */
  myFollow: "none" | "pending" | "accepted" | "self" | "anonymous";
};

/**
 * Le profil public d'un membre (P1).
 *
 * Renvoie `null` quand le pseudonyme n'existe pas **ou** que l'accès est
 * refusé : les deux cas sont indistinguables de l'extérieur, par construction.
 */
export async function getProfileView(
  username: string,
): Promise<ProfileViewData | null> {
  const acc = await accessToUsername(username);
  if (!acc || !acc.access.canSeeProfile) return null;

  const authorId = acc.author.id;
  const viewer = acc.viewer;

  const [favorites, works, entries, lists, pinned, followers, following, mine] =
    await Promise.all([
      db.favorite.findMany({
        where: { userId: authorId },
        orderBy: { position: "asc" },
        select: { work: { select: WORK_SELECT } },
      }),
      db.userWork.count({ where: { userId: authorId } }),
      acc.access.canSeeStats
        ? db.journalEntry.count({ where: { userId: authorId, hiddenAt: null } })
        : Promise.resolve(0),
      db.list.count({
        where: { userId: authorId, isPrivate: false, hiddenAt: null },
      }),
      acc.access.canSeeLists
        ? db.list.findMany({
            where: {
              userId: authorId,
              isPinned: true,
              isPrivate: false,
              hiddenAt: null,
            },
            orderBy: { createdAt: "desc" },
            take: 4,
            select: {
              id: true,
              title: true,
              slug: true,
              _count: { select: { items: true } },
            },
          })
        : Promise.resolve([]),
      db.follow.count({ where: { followingId: authorId, status: "ACCEPTED" } }),
      db.follow.count({ where: { followerId: authorId, status: "ACCEPTED" } }),
      viewer && viewer.id !== authorId
        ? db.follow.findUnique({
            where: {
              followerId_followingId: {
                followerId: viewer.id,
                followingId: authorId,
              },
            },
            select: { status: true },
          })
        : Promise.resolve(null),
    ]);

  const cover = await authorCovers(
    favorites.map((f) => f.work),
    authorId,
  );

  return {
    access: acc,
    favorites: favorites.map((f) => cover(f.work)),
    counts: { works, entries, lists },
    pinnedLists: pinned.map((l) => ({
      id: l.id,
      title: l.title,
      slug: l.slug,
      items: l._count.items,
    })),
    follows: acc.access.canSeeFollowGraph ? { followers, following } : null,
    myFollow: !viewer
      ? "anonymous"
      : viewer.id === authorId
        ? "self"
        : mine?.status === "ACCEPTED"
          ? "accepted"
          : mine?.status === "PENDING"
            ? "pending"
            : "none",
  };
}

const ENTRY_SELECT = {
  id: true,
  userId: true,
  loggedAt: true,
  datePrecision: true,
  rating: true,
  reviewText: true,
  reviewHasSpoiler: true,
  isRewatch: true,
  isSeasonBatch: true,
  context: true,
  hiddenAt: true,
  createdAt: true,
  season: { select: { number: true } },
  episode: { select: { number: true } },
  tome: { select: { number: true } },
  work: { select: WORK_SELECT },
} as const;

export type PublicEntry = {
  id: string;
  loggedAt: Date | null;
  datePrecision: "DAY" | "MONTH" | "YEAR" | "UNKNOWN";
  rating: number | null;
  reviewText: string | null;
  reviewHasSpoiler: boolean;
  isRewatch: boolean;
  isSeasonBatch: boolean;
  context: string | null;
  hiddenAt: Date | null;
  season: { number: number } | null;
  episode: { number: number } | null;
  tome: { number: number } | null;
  work: PublicWork;
};

/** Le journal visible d'un membre (P1), antichronologique comme `/journal`. */
export async function getPublicJournal(
  username: string,
  opts: { type?: WorkType; take?: number } = {},
): Promise<{ author: AccessTo; entries: PublicEntry[] } | null> {
  const acc = await accessToUsername(username);
  if (!acc || !acc.access.canSeeJournal) return null;

  const owner = isOwnerOrAdmin(acc.viewer, acc.author.id);

  const rows = await db.journalEntry.findMany({
    where: {
      userId: acc.author.id,
      // Le propriétaire et l'administrateur voient leur contenu masqué, coiffé
      // d'un bandeau : on ne fait pas disparaître un écrit sans le dire.
      ...(owner ? {} : { hiddenAt: null }),
      ...(opts.type ? { work: { type: opts.type } } : {}),
    },
    orderBy: [
      { loggedAt: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    take: opts.take ?? 100,
    select: ENTRY_SELECT,
  });

  const cover = await authorCovers(
    rows.map((r) => r.work),
    acc.author.id,
  );

  return {
    author: acc,
    entries: rows.map((r) => ({ ...r, work: cover(r.work) })),
  };
}

/** Le permalien d'une entrée (P3) — la cible d'un j'aime ou d'un commentaire. */
export async function getPublicEntry(
  username: string,
  entryId: string,
): Promise<{ author: AccessTo; entry: PublicEntry } | null> {
  const acc = await accessToUsername(username);
  if (!acc || !acc.access.canSeeJournal) return null;

  const row = await db.journalEntry.findFirst({
    // L'entrée doit appartenir à ce membre : un identifiant valable sous un
    // autre pseudonyme ne doit pas s'afficher ici.
    where: { id: entryId, userId: acc.author.id },
    select: ENTRY_SELECT,
  });
  if (!row) return null;

  const owner = isOwnerOrAdmin(acc.viewer, acc.author.id);
  if (!canSeeContent(acc.access, { hiddenAt: row.hiddenAt }, owner)) return null;

  const cover = await authorCovers([row.work], acc.author.id);

  return { author: acc, entry: { ...row, work: cover(row.work) } };
}

export type PublicReview = {
  /** L'identifiant du `UserWork` — la cible sociale d'une critique. */
  id: string;
  rating: number | null;
  reviewText: string;
  reviewHasSpoiler: boolean;
  reviewedAt: Date | null;
  liked: boolean;
  hiddenAt: Date | null;
  work: PublicWork;
};

const REVIEW_SELECT = {
  id: true,
  currentRating: true,
  reviewText: true,
  reviewHasSpoiler: true,
  reviewedAt: true,
  liked: true,
  hiddenAt: true,
  work: { select: WORK_SELECT },
} as const;

function toReview(row: {
  id: string;
  currentRating: number | null;
  reviewText: string | null;
  reviewHasSpoiler: boolean;
  reviewedAt: Date | null;
  liked: boolean;
  hiddenAt: Date | null;
  work: PublicWork;
}): PublicReview {
  return {
    id: row.id,
    rating: row.currentRating,
    reviewText: row.reviewText ?? "",
    reviewHasSpoiler: row.reviewHasSpoiler,
    reviewedAt: row.reviewedAt,
    liked: row.liked,
    hiddenAt: row.hiddenAt,
    work: row.work,
  };
}

/** Les critiques d'œuvres d'un membre (S7, P1). */
export async function getPublicReviews(
  username: string,
  opts: { take?: number } = {},
): Promise<{ author: AccessTo; reviews: PublicReview[] } | null> {
  const acc = await accessToUsername(username);
  if (!acc || !acc.access.canSeeReviews) return null;

  const owner = isOwnerOrAdmin(acc.viewer, acc.author.id);

  const rows = await db.userWork.findMany({
    where: {
      userId: acc.author.id,
      // Une fiche de suivi sans critique n'est pas un objet public : on
      // n'expose pas un statut de lecture, seulement un écrit.
      reviewText: { not: null },
      ...(owner ? {} : { hiddenAt: null }),
    },
    orderBy: { reviewedAt: { sort: "desc", nulls: "last" } },
    take: opts.take ?? 50,
    select: REVIEW_SELECT,
  });

  const cover = await authorCovers(
    rows.map((r) => r.work),
    acc.author.id,
  );

  return {
    author: acc,
    reviews: rows.map((r) => toReview({ ...r, work: cover(r.work) })),
  };
}

/** Le permalien d'une critique, désignée par son œuvre (P3). */
export async function getPublicReview(
  username: string,
  workId: string,
): Promise<{ author: AccessTo; review: PublicReview } | null> {
  const acc = await accessToUsername(username);
  if (!acc || !acc.access.canSeeReviews) return null;

  const row = await db.userWork.findFirst({
    where: { userId: acc.author.id, workId, reviewText: { not: null } },
    select: REVIEW_SELECT,
  });
  if (!row) return null;

  const owner = isOwnerOrAdmin(acc.viewer, acc.author.id);
  if (!canSeeContent(acc.access, { hiddenAt: row.hiddenAt }, owner)) return null;

  const cover = await authorCovers([row.work], acc.author.id);

  return { author: acc, review: toReview({ ...row, work: cover(row.work) }) };
}

export type PublicListCard = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  isRanked: boolean;
  isPinned: boolean;
  isPrivate: boolean;
  hiddenAt: Date | null;
  coverImageId: string | null;
  items: number;
  covers: PublicWork[];
};

/** Les listes visibles d'un membre (S9, P1). */
export async function getPublicLists(
  username: string,
): Promise<{ author: AccessTo; lists: PublicListCard[] } | null> {
  const acc = await accessToUsername(username);
  if (!acc || !acc.access.canSeeLists) return null;

  const owner = isOwnerOrAdmin(acc.viewer, acc.author.id);

  const rows = await db.list.findMany({
    where: {
      userId: acc.author.id,
      ...(owner ? {} : { isPrivate: false, hiddenAt: null }),
    },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      isRanked: true,
      isPinned: true,
      isPrivate: true,
      hiddenAt: true,
      coverImageId: true,
      _count: { select: { items: true } },
      items: {
        orderBy: { position: "asc" },
        take: 4,
        select: { work: { select: WORK_SELECT } },
      },
    },
  });

  const cover = await authorCovers(
    rows.flatMap((l) => l.items.map((i) => i.work)),
    acc.author.id,
  );

  return {
    author: acc,
    lists: rows.map((l) => ({
      id: l.id,
      title: l.title,
      slug: l.slug,
      description: l.description,
      isRanked: l.isRanked,
      isPinned: l.isPinned,
      isPrivate: l.isPrivate,
      hiddenAt: l.hiddenAt,
      coverImageId: l.coverImageId,
      items: l._count.items,
      covers: l.items.map((i) => cover(i.work)),
    })),
  };
}

export type PublicListDetail = PublicListCard & {
  entries: { id: string; position: number; note: string | null; work: PublicWork }[];
};

/** Une liste publique et son contenu (S9, P3 — cible sociale). */
export async function getPublicList(
  username: string,
  slug: string,
): Promise<{ author: AccessTo; list: PublicListDetail } | null> {
  const acc = await accessToUsername(username);
  if (!acc || !acc.access.canSeeLists) return null;

  const row = await db.list.findFirst({
    where: { userId: acc.author.id, slug },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      isRanked: true,
      isPinned: true,
      isPrivate: true,
      hiddenAt: true,
      coverImageId: true,
      _count: { select: { items: true } },
      items: {
        orderBy: { position: "asc" },
        take: 500,
        select: {
          id: true,
          position: true,
          note: true,
          work: { select: WORK_SELECT },
        },
      },
    },
  });
  if (!row) return null;

  const owner = isOwnerOrAdmin(acc.viewer, acc.author.id);
  if (
    !canSeeContent(
      acc.access,
      { hiddenAt: row.hiddenAt, isPrivate: row.isPrivate },
      owner,
    )
  ) {
    return null;
  }

  const cover = await authorCovers(
    row.items.map((i) => i.work),
    acc.author.id,
  );
  const entries = row.items.map((i) => ({ ...i, work: cover(i.work) }));

  return {
    author: acc,
    list: {
      id: row.id,
      title: row.title,
      slug: row.slug,
      description: row.description,
      isRanked: row.isRanked,
      isPinned: row.isPinned,
      isPrivate: row.isPrivate,
      hiddenAt: row.hiddenAt,
      coverImageId: row.coverImageId,
      items: row._count.items,
      covers: entries.slice(0, 4).map((i) => i.work),
      entries,
    },
  };
}

export type PublicMember = {
  id: string;
  name: string;
  username: string | null;
  image: string | null;
  bio: string | null;
};

/**
 * Les abonnés ou abonnements d'un membre (P2).
 *
 * Les comptes bloqués sont retirés de la liste, dans les deux sens : voir
 * apparaître quelqu'un qu'on a bloqué dans la liste d'abonnés d'un tiers
 * viderait le geste de son sens.
 */
export async function getFollowList(
  username: string,
  direction: "followers" | "following",
): Promise<{ author: AccessTo; members: PublicMember[] } | null> {
  const acc = await accessToUsername(username);
  if (!acc || !acc.access.canSeeFollowGraph) return null;

  const viewer = await getViewer();
  const blocked = await blockedUserIds(viewer?.id ?? null);

  const rows = await db.follow.findMany({
    where: {
      status: "ACCEPTED",
      ...(direction === "followers"
        ? { followingId: acc.author.id, followerId: { notIn: blocked } }
        : { followerId: acc.author.id, followingId: { notIn: blocked } }),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      follower: {
        select: {
          id: true,
          name: true,
          username: true,
          image: true,
          bio: true,
        },
      },
      following: {
        select: {
          id: true,
          name: true,
          username: true,
          image: true,
          bio: true,
        },
      },
    },
  });

  return {
    author: acc,
    members: rows.map((r) =>
      direction === "followers" ? r.follower : r.following,
    ),
  };
}

/** Le profil d'un membre par identifiant — pour les pages de `(app)`. */
export async function getAccess(authorId: string) {
  return accessTo(authorId);
}

export type SocialCounts = {
  likes: number;
  comments: number;
  /** Le visiteur a-t-il déjà aimé ? `false` s'il n'est pas connecté. */
  likedByMe: boolean;
  /** Peut-il aimer et commenter ? Décide de l'état des boutons. */
  canInteract: boolean;
};

/** Les compteurs sociaux d'une cible (P3). */
export async function getSocialCounts(
  target: SocialTarget,
  ownerId: string,
): Promise<SocialCounts> {
  const viewer = await getViewer();
  const where = targetWhere(target);

  const [likes, comments, mine, acc] = await Promise.all([
    db.socialLike.count({ where }),
    // Les commentaires masqués ne comptent pas : afficher « 3 commentaires »
    // et n'en montrer que deux serait le meilleur moyen de faire chercher le
    // troisième.
    db.comment.count({ where: { ...where, hiddenAt: null } }),
    viewer
      ? db.socialLike.findFirst({
          where: { userId: viewer.id, ...where },
          select: { id: true },
        })
      : Promise.resolve(null),
    viewer ? accessTo(ownerId) : Promise.resolve(null),
  ]);

  return {
    likes,
    comments,
    likedByMe: mine !== null,
    canInteract: acc?.access.canInteract ?? false,
  };
}

export type NotificationData = {
  id: string;
  type: NotificationType;
  createdAt: Date;
  readAt: Date | null;
  actor: PublicMember | null;
  /** Permalien de la cible, ou du profil pour un abonnement. `null` si perdu. */
  href: string | null;
  /** Titre de l'œuvre ou de la liste concernée, pour situer la notification. */
  label: string | null;
};

/**
 * La boîte de réception (P3).
 *
 * Rien n'est marqué comme lu au passage : un Server Component ne doit pas
 * écrire, et un effet de bord au rendu serait irreproductible en test. Le
 * marquage est un geste explicite.
 */
export async function getNotifications(
  userId: string,
  take = 50,
): Promise<NotificationData[]> {
  const rows = await db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      type: true,
      createdAt: true,
      readAt: true,
      actor: {
        select: {
          id: true,
          name: true,
          username: true,
          image: true,
          bio: true,
        },
      },
      journalEntryId: true,
      listId: true,
      userWorkId: true,
      workId: true,
      list: { select: { slug: true, title: true, user: { select: { username: true } } } },
      journalEntry: {
        select: {
          work: { select: { titleFr: true } },
          user: { select: { username: true } },
        },
      },
      userWork: {
        select: {
          workId: true,
          work: { select: { titleFr: true } },
          user: { select: { username: true } },
        },
      },
      work: { select: { titleFr: true } },
    },
  });

  return rows.map((n) => {
    let href: string | null = null;
    let label: string | null = null;

    if (n.journalEntryId && n.journalEntry) {
      href = targetHref(
        { kind: "entry", id: n.journalEntryId },
        { username: n.journalEntry.user.username ?? "" },
      );
      label = n.journalEntry.work.titleFr;
    } else if (n.listId && n.list) {
      href = targetHref(
        { kind: "list", id: n.listId },
        { username: n.list.user.username ?? "", slug: n.list.slug },
      );
      label = n.list.title;
    } else if (n.userWorkId && n.userWork) {
      href = targetHref(
        { kind: "review", id: n.userWorkId },
        {
          username: n.userWork.user.username ?? "",
          workId: n.userWork.workId,
        },
      );
      label = n.userWork.work.titleFr;
    } else if (n.workId && n.work) {
      // Une proposition de correction (D30) mène à la fiche, pas à un profil.
      href = `/oeuvre/${n.workId}`;
      label = n.work.titleFr;
    } else if (n.actor?.username) {
      // Abonnements : la cible est le profil de l'acteur.
      href = `/u/${n.actor.username}`;
    }

    return {
      id: n.id,
      type: n.type,
      createdAt: n.createdAt,
      readAt: n.readAt,
      actor: n.actor,
      href,
      label,
    };
  });
}

/** Le compteur de la barre supérieure — une requête indexée par page. */
export async function countUnreadNotifications(
  userId: string,
): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}

export type CommentData = {
  id: string;
  body: string;
  createdAt: Date;
  hiddenAt: Date | null;
  author: PublicMember;
  /** Le visiteur peut-il le supprimer ? (auteur, propriétaire, admin) */
  canDelete: boolean;
};

/**
 * Le fil de commentaires d'une cible (P3), plat et chronologique.
 *
 * Les commentaires des comptes bloqués sont retirés, dans les deux sens : c'est
 * la contrepartie de ne pas les supprimer au blocage, ce qui rend le déblocage
 * réversible.
 */
export async function getComments(
  target: SocialTarget,
  ownerId: string,
): Promise<CommentData[]> {
  const viewer = await getViewer();
  const blocked = await blockedUserIds(viewer?.id ?? null);
  const isModerator = viewer?.isAdmin ?? false;

  const rows = await db.comment.findMany({
    where: {
      ...targetWhere(target),
      authorId: { notIn: blocked },
      // Son auteur voit son commentaire masqué ; les autres non.
      ...(isModerator
        ? {}
        : viewer
          ? { OR: [{ hiddenAt: null }, { authorId: viewer.id }] }
          : { hiddenAt: null }),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      body: true,
      createdAt: true,
      hiddenAt: true,
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          image: true,
          bio: true,
        },
      },
    },
  });

  return rows.map((c) => ({
    ...c,
    canDelete:
      viewer !== null &&
      (viewer.id === c.author.id || viewer.id === ownerId || viewer.isAdmin),
  }));
}
