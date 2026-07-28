import "server-only";

import { db } from "@/lib/db";
import { resolveCovers } from "@/lib/cover-loader";
import type { WorkType } from "@/generated/prisma/enums";
import { blockedUserIds } from "./access";

/**
 * Les agrégats de la page « Découvrir » (lot 4, P2).
 *
 * Ils vivent ici et non dans la page pour deux raisons. La première est la
 * règle du dépôt : une page décrit ce qu'elle affiche, pas comment on
 * l'obtient. La seconde est mécanique — `Date.now()` appelé dans le corps d'un
 * composant est refusé par `react-hooks/purity`, et à raison : une fenêtre
 * temporelle recalculée à chaque rendu n'est pas une donnée stable.
 *
 * Les compteurs portent sur le catalogue partagé (D29) : ce sont des agrégats
 * de l'instance, jamais des données individuelles rendues lisibles.
 */

/** La fenêtre de « ce qui se voit en ce moment ». */
export const RECENT_DAYS = 30;

export type PopularWork = {
  work: {
    id: string;
    type: WorkType;
    titleFr: string;
    year: number | null;
    coverImageId: string | null;
  };
  count: number;
};

export type DiscoverData = {
  /** Les œuvres que le plus de membres ont dans leur bibliothèque. */
  tracked: PopularWork[];
  /** Les œuvres les plus consignées sur la fenêtre récente. */
  recent: PopularWork[];
  members: {
    id: string;
    name: string;
    username: string | null;
    image: string | null;
    bio: string | null;
  }[];
};

export async function getDiscoverData(viewerId: string): Promise<DiscoverData> {
  const blocked = await blockedUserIds(viewerId);
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000);

  const [tracked, recent, members] = await Promise.all([
    db.userWork.groupBy({
      by: ["workId"],
      where: { userId: { notIn: blocked } },
      _count: { workId: true },
      orderBy: { _count: { workId: "desc" } },
      take: 12,
    }),
    db.journalEntry.groupBy({
      by: ["workId"],
      where: {
        userId: { notIn: blocked },
        hiddenAt: null,
        // Sans ce filtre, un import massif ferait passer trois mille œuvres
        // pour « ce qui se voit en ce moment ».
        importKey: null,
        createdAt: { gte: since },
      },
      _count: { workId: true },
      orderBy: { _count: { workId: "desc" } },
      take: 12,
    }),
    db.user.findMany({
      where: {
        id: { notIn: [...blocked, viewerId] },
        banned: false,
        visibility: { in: ["PUBLIC", "MEMBERS"] },
        // Sans pseudonyme, pas de profil à visiter : la suggestion serait vaine.
        username: { not: null },
        // Ceux que je suis déjà n'ont rien à faire dans une suggestion.
        followers: { none: { followerId: viewerId } },
      },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        name: true,
        username: true,
        image: true,
        bio: true,
      },
    }),
  ]);

  // Une seule requête pour les deux classements : les œuvres se recoupent
  // largement, et deux findMany feraient le même travail deux fois.
  const workIds = [...new Set([...tracked, ...recent].map((r) => r.workId))];
  const works = workIds.length
    ? await db.work.findMany({
        where: { id: { in: workIds } },
        select: {
          id: true,
          type: true,
          titleFr: true,
          year: true,
          coverImageId: true,
        },
      })
    : [];
  // « Ce qui se voit en ce moment » n'appartient à personne : la couverture
  // affichée est celle de l'édition par défaut (lot 5).
  const covers = await resolveCovers(works);
  const byId = new Map(
    works.map((w) => [w.id, { ...w, coverImageId: covers.get(w.id) }]),
  );

  const hydrate = (rows: { workId: string; _count: { workId: number } }[]) =>
    rows.flatMap((r) => {
      const work = byId.get(r.workId);
      return work ? [{ work, count: r._count.workId }] : [];
    });

  return { tracked: hydrate(tracked), recent: hydrate(recent), members };
}
