import "server-only";

import { db } from "@/lib/db";
import { resolveCovers } from "@/lib/cover-loader";
import {
  buildFeedPage,
  decodeCursor,
  FEED_PAGE_SIZE,
  type FeedItem,
} from "@/lib/feed";
import type { WorkType } from "@/generated/prisma/enums";
import { blockedUserIds } from "./access";
import { getViewer } from "./viewer";

/**
 * Les trois sources du fil (lot 4, P2) et leur assemblage.
 *
 * `src/lib/feed.ts` fusionne et déduplique sans base ; ce module va chercher
 * les lignes. Trois filtres y sont indispensables, et leur oubli ne se
 * remarquerait pas tout de suite :
 *
 * - **`importKey: null`.** Sans lui, un import Letterboxd de 3 000 entrées noie
 *   le fil de tous les abonnés en une seconde. C'est la conséquence sociale
 *   directe du lot 2, invisible tant qu'on n'a pas d'abonnés.
 * - **`hiddenAt: null`.** Un contenu masqué par la modération sort des surfaces
 *   sociales, fil compris.
 * - **`userId notIn blockedUserIds`.** Le blocage vaut dans les deux sens.
 *
 * L'ordre est celui de la publication (`createdAt`, `reviewedAt`), jamais celui
 * de la consommation (`loggedAt`) : voir le commentaire de `FeedItem`.
 */

export type FeedScope = "following" | "discover";

/** Ce qu'il faut pour rendre une carte de fil, indexé par identifiant. */
export type FeedPayload = {
  authors: Map<string, FeedAuthorRow>;
  entries: Map<string, EntryRow>;
  reviews: Map<string, ReviewRow>;
  lists: Map<string, ListRow>;
};

type FeedAuthorRow = {
  id: string;
  name: string;
  username: string | null;
  image: string | null;
};

const AUTHOR_SELECT = {
  id: true,
  name: true,
  username: true,
  image: true,
} as const;

const WORK_SELECT = {
  id: true,
  type: true,
  titleFr: true,
  year: true,
  coverImageId: true,
} as const;

type EntryRow = Awaited<ReturnType<typeof fetchEntries>>[number];
type ReviewRow = Awaited<ReturnType<typeof fetchReviews>>[number];
type ListRow = Awaited<ReturnType<typeof fetchLists>>[number];

function fetchEntries(authorIds: string[], before: Date, take: number) {
  return db.journalEntry.findMany({
    where: {
      userId: { in: authorIds },
      hiddenAt: null,
      importKey: null,
      createdAt: { lt: before },
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      userId: true,
      createdAt: true,
      loggedAt: true,
      datePrecision: true,
      rating: true,
      reviewText: true,
      reviewHasSpoiler: true,
      isRewatch: true,
      isSeasonBatch: true,
      context: true,
      season: { select: { number: true } },
      episode: { select: { number: true } },
      tome: { select: { number: true } },
      work: { select: WORK_SELECT },
      user: { select: AUTHOR_SELECT },
    },
  });
}

function fetchReviews(authorIds: string[], before: Date, take: number) {
  return db.userWork.findMany({
    where: {
      userId: { in: authorIds },
      hiddenAt: null,
      reviewText: { not: null },
      reviewedAt: { not: null, lt: before },
    },
    orderBy: { reviewedAt: "desc" },
    take,
    select: {
      id: true,
      userId: true,
      currentRating: true,
      reviewText: true,
      reviewHasSpoiler: true,
      reviewedAt: true,
      liked: true,
      hiddenAt: true,
      work: { select: WORK_SELECT },
      user: { select: AUTHOR_SELECT },
    },
  });
}

function fetchLists(authorIds: string[], before: Date, take: number) {
  return db.list.findMany({
    where: {
      userId: { in: authorIds },
      hiddenAt: null,
      isPrivate: false,
      importKey: null,
      createdAt: { lt: before },
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      userId: true,
      title: true,
      slug: true,
      description: true,
      isRanked: true,
      createdAt: true,
      _count: { select: { items: true } },
      items: {
        orderBy: { position: "asc" },
        take: 4,
        select: { work: { select: WORK_SELECT } },
      },
      user: { select: AUTHOR_SELECT },
    },
  });
}

/** Les comptes dont le fil montre l'activité. */
async function feedAuthors(
  scope: FeedScope,
  viewerId: string,
  blocked: string[],
): Promise<string[]> {
  if (scope === "following") {
    const rows = await db.follow.findMany({
      where: {
        followerId: viewerId,
        status: "ACCEPTED",
        followingId: { notIn: blocked },
      },
      select: { followingId: true },
    });
    // Soi-même dans son propre fil : sans cela, un membre sans abonnement voit
    // une page vide et ne comprend pas à quoi elle sert.
    return [...rows.map((r) => r.followingId), viewerId];
  }

  // « Découvrir » : les comptes ouverts, non bannis, moins les bloqués et soi.
  // Requête bornée — à restreindre à l'activité récente si l'instance grandit.
  const rows = await db.user.findMany({
    where: {
      visibility: { in: ["PUBLIC", "MEMBERS"] },
      banned: false,
      id: { notIn: [...blocked, viewerId] },
    },
    take: 500,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export type FeedResult = {
  items: FeedItem[];
  nextCursor: string | null;
  payload: FeedPayload;
};

/**
 * Une page de fil pour le visiteur courant.
 *
 * Renvoie une page vide plutôt que `null` quand il n'y a pas de session : la
 * page appelante vit dans `(app)`, donc derrière `requireUser()` — ce cas ne
 * devrait pas se produire, et lever y serait disproportionné.
 */
export async function getFeed(
  scope: FeedScope,
  opts: { cursor?: string; type?: WorkType; limit?: number } = {},
): Promise<FeedResult> {
  const empty: FeedResult = {
    items: [],
    nextCursor: null,
    payload: {
      authors: new Map(),
      entries: new Map(),
      reviews: new Map(),
      lists: new Map(),
    },
  };

  const viewer = await getViewer();
  if (!viewer) return empty;

  const blocked = await blockedUserIds(viewer.id);
  const authorIds = await feedAuthors(scope, viewer.id, blocked);
  if (authorIds.length === 0) return empty;

  const limit = opts.limit ?? FEED_PAGE_SIZE;
  const cursor = decodeCursor(opts.cursor);
  const before = cursor?.at ?? new Date();

  // `limit + 1` par source : la fusion doit disposer d'assez de matière pour
  // que la coupe tombe au bon endroit, quelle que soit la répartition.
  const take = limit + 1;
  const [entries, reviews, lists] = await Promise.all([
    fetchEntries(authorIds, before, take),
    fetchReviews(authorIds, before, take),
    fetchLists(authorIds, before, take),
  ]);

  const filterType = (workType: WorkType) =>
    !opts.type || workType === opts.type;

  const sources: FeedItem[][] = [
    entries
      .filter((e) => filterType(e.work.type))
      .map((e) => ({
        kind: "entry" as const,
        id: e.id,
        authorId: e.userId,
        at: e.createdAt,
        workId: e.work.id,
        text: e.reviewText,
      })),
    reviews
      .filter((r) => filterType(r.work.type))
      .map((r) => ({
        kind: "review" as const,
        id: r.id,
        authorId: r.userId,
        // `reviewedAt` est non nul par la clause `where`.
        at: r.reviewedAt!,
        workId: r.work.id,
        text: r.reviewText,
      })),
    // Une liste est multi-médias par nature (D11) : la filtrer par type n'a pas
    // de sens, on la retire simplement des vues filtrées.
    opts.type
      ? []
      : lists.map((l) => ({
          kind: "list" as const,
          id: l.id,
          authorId: l.userId,
          at: l.createdAt,
          workId: null,
          text: l.description,
        })),
  ];

  const page = buildFeedPage(sources, limit);

  const authors = new Map<string, FeedAuthorRow>();
  for (const row of [...entries, ...reviews, ...lists]) {
    authors.set(row.user.id, row.user);
  }

  // Chaque élément est illustré par l'édition que lit **son auteur** (lot 5) :
  // le regard varie d'une ligne à l'autre, la résolution reste groupée.
  const covers = await resolveCovers([
    ...entries.map((e) => ({ ...e.work, viewerId: e.userId })),
    ...reviews.map((r) => ({ ...r.work, viewerId: r.userId })),
    ...lists.flatMap((l) =>
      l.items.map((i) => ({ ...i.work, viewerId: l.userId })),
    ),
  ]);
  const cover = <T extends { id: string }>(work: T, authorId: string): T => ({
    ...work,
    coverImageId: covers.get(work.id, authorId),
  });

  return {
    items: page.items,
    nextCursor: page.nextCursor,
    payload: {
      authors,
      entries: new Map(
        entries.map((e) => [e.id, { ...e, work: cover(e.work, e.userId) }]),
      ),
      reviews: new Map(
        reviews.map((r) => [r.id, { ...r, work: cover(r.work, r.userId) }]),
      ),
      lists: new Map(
        lists.map((l) => [
          l.id,
          {
            ...l,
            items: l.items.map((i) => ({ ...i, work: cover(i.work, l.userId) })),
          },
        ]),
      ),
    },
  };
}
