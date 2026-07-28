import "server-only";

import { cache } from "react";
import { db } from "@/lib/db";
import {
  resolveAccess,
  type Access,
  type AuthorProfile,
  type Viewer,
} from "@/lib/visibility";

/**
 * La porte de lecture du lot 4 (D25, D26) — socle commun.
 *
 * `src/lib/visibility.ts` décide, ce module charge ce qu'il faut pour décider.
 * La séparation n'est pas cosmétique : elle rend la règle testable sans base,
 * et elle concentre ici les requêtes qui, oubliées, ouvriraient un compte privé.
 *
 * **Ce module ne lit jamais la session** : le visiteur lui est toujours passé.
 * C'est ce qui permet à `scripts/verify.ts` de l'exercer hors de toute requête
 * HTTP — `src/lib/session.ts` importe `next/navigation`, qui ne se charge pas
 * sous la condition `react-server` du script. « Qui regarde » vit dans
 * `viewer.ts`, « que peut-il voir » ici.
 *
 * Les lectures sont mémoïsées par requête via `cache()` de React : une page de
 * profil interroge l'accès depuis son composant principal et depuis chacune de
 * ses sections.
 */

/**
 * Les comptes que ce visiteur ne doit jamais voir : blocages **dans les deux
 * sens**.
 *
 * `Block` est stocké dans un seul sens (A bloque B) mais s'applique dans les
 * deux — sinon un bloqueur continuerait de voir celui qu'il a bloqué, ce qui
 * vide le geste de son sens. Cette asymétrie entre stockage et effet est la
 * première source d'erreur du lot ; elle est neutralisée ici, une fois, et
 * aucune autre requête ne consulte la table.
 *
 * Le `notIn` qui en découle convient à quelques centaines de blocages. Au-delà,
 * il faudra un `NOT EXISTS` corrélé — à surveiller si l'instance s'ouvre.
 */
export const blockedUserIds = cache(
  async (viewerId: string | null): Promise<string[]> => {
    if (!viewerId) return [];
    const rows = await db.block.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    });
    const ids = new Set<string>();
    for (const row of rows) {
      ids.add(row.blockerId === viewerId ? row.blockedId : row.blockerId);
    }
    return [...ids];
  },
);

const AUTHOR_SELECT = {
  id: true,
  name: true,
  username: true,
  displayUsername: true,
  image: true,
  bio: true,
  createdAt: true,
  banned: true,
  visibility: true,
  showJournalPublicly: true,
  showStatsPublicly: true,
} as const;

/** L'auteur tel que les vues publiques l'affichent. */
export type PublicAuthor = {
  id: string;
  name: string;
  username: string | null;
  image: string | null;
  bio: string | null;
  createdAt: Date;
};

export type AccessTo = {
  author: AuthorProfile;
  profile: PublicAuthor;
  access: Access;
  viewer: Viewer;
};

/**
 * Charge un auteur, la relation du visiteur avec lui, et le verdict d'accès.
 *
 * Le visiteur est un **paramètre** et non une lecture de session : c'est ce qui
 * permet à `scripts/verify.ts` d'exercer ce chemin exact contre la vraie base,
 * hors de toute requête HTTP. Une règle de confidentialité vérifiée sur une
 * réimplémentation ne prouve rien.
 *
 * Renvoie `null` si le compte n'existe pas — l'appelant fait `notFound()`, la
 * même réponse que pour un accès refusé. Un 403 confirmerait l'existence d'un
 * compte privé et dirait à un bloqué qu'il l'est.
 */
export async function accessFor(
  viewer: Viewer,
  authorId: string,
): Promise<AccessTo | null> {
  const row = await db.user.findUnique({
    where: { id: authorId },
    select: AUTHOR_SELECT,
  });
  if (!row) return null;

  return buildAccess(row, viewer);
}

/** `accessFor` à partir du pseudonyme — l'entrée des pages `/u/[username]`. */
export async function accessForUsername(
  viewer: Viewer,
  username: string,
): Promise<AccessTo | null> {
  // `username` est nullable en base (plugin better-auth) : findFirst, pas
  // findUnique sur une valeur possiblement absente.
  const row = await db.user.findFirst({
    where: { username },
    select: AUTHOR_SELECT,
  });
  if (!row) return null;

  return buildAccess(row, viewer);
}

async function buildAccess(
  row: {
    id: string;
    name: string;
    username: string | null;
    image: string | null;
    bio: string | null;
    createdAt: Date;
    banned: boolean;
    visibility: AuthorProfile["visibility"];
    showJournalPublicly: boolean;
    showStatsPublicly: boolean;
  },
  viewer: Viewer,
): Promise<AccessTo> {
  const isSelf = viewer?.id === row.id;

  // Deux requêtes en parallèle, et seulement quand elles peuvent changer le
  // verdict : un visiteur déconnecté n'a ni abonnement ni blocage.
  const [follow, blocked] = await Promise.all([
    viewer && !isSelf
      ? db.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: viewer.id,
              followingId: row.id,
            },
          },
          select: { status: true },
        })
      : Promise.resolve(null),
    viewer && !isSelf ? blockedUserIds(viewer.id) : Promise.resolve([]),
  ]);

  const author: AuthorProfile = {
    id: row.id,
    visibility: row.visibility,
    showJournalPublicly: row.showJournalPublicly,
    showStatsPublicly: row.showStatsPublicly,
    banned: row.banned,
  };

  const access = resolveAccess(viewer, author, {
    isSelf,
    // Seul un abonnement ACCEPTED ouvre un compte privé : un PENDING attend.
    followsAuthor: follow?.status === "ACCEPTED",
    blockEitherWay: blocked.includes(row.id),
  });

  return {
    author,
    profile: {
      id: row.id,
      name: row.name,
      username: row.username,
      image: row.image,
      bio: row.bio,
      createdAt: row.createdAt,
    },
    access,
    viewer,
  };
}

/** Le visiteur est-il l'auteur, ou l'administrateur ? Sert à `canSeeContent`. */
export function isOwnerOrAdmin(viewer: Viewer, authorId: string): boolean {
  if (!viewer) return false;
  return viewer.id === authorId || viewer.isAdmin;
}
