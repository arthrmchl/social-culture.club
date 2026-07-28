import "server-only";

import { db } from "@/lib/db";
import { resolveAccess } from "@/lib/visibility";
import {
  targetWhere,
  type SocialTarget,
  TARGET_LABELS,
} from "@/lib/social-target";
import { blockedUserIds } from "./access";

/**
 * Le pendant de `access.ts` pour les **écritures** (lot 4, P3, P4).
 *
 * `access.ts` répond à « qu'ai-je le droit de voir ? », ce module à « ai-je le
 * droit de poser ce geste ? ». Toute action sociale passe par là ; aucune ne
 * consulte `Block` ni `User.visibility` elle-même. C'est ce qui fait qu'ajouter
 * une action ne peut pas créer un trou : elle n'a pas d'autre chemin.
 */

export const CANNOT_INTERACT = "Ce contenu ne vous est pas accessible.";
export const TARGET_GONE = "Contenu introuvable.";

/**
 * Ce visiteur peut-il interagir avec cet auteur ?
 *
 * Réutilise `resolveAccess` plutôt que de recoder la règle : un compte privé
 * dont on n'est pas abonné ne se commente pas plus qu'il ne se lit, et le jour
 * où la règle change, elle change en un seul endroit.
 */
export async function assertCanInteract(
  viewerId: string,
  authorId: string,
): Promise<{ ok: true } | { error: string }> {
  if (viewerId === authorId) {
    // On agit librement sur son propre contenu — la garde ne concerne que ce
    // qui appartient à autrui.
    return { ok: true };
  }

  const [author, blocked] = await Promise.all([
    db.user.findUnique({
      where: { id: authorId },
      select: {
        id: true,
        banned: true,
        visibility: true,
        showJournalPublicly: true,
        showStatsPublicly: true,
      },
    }),
    blockedUserIds(viewerId),
  ]);
  if (!author) return { error: TARGET_GONE };

  const follow = await db.follow.findUnique({
    where: {
      followerId_followingId: { followerId: viewerId, followingId: authorId },
    },
    select: { status: true },
  });

  const access = resolveAccess({ id: viewerId, isAdmin: false }, author, {
    isSelf: false,
    followsAuthor: follow?.status === "ACCEPTED",
    blockEitherWay: blocked.includes(authorId),
  });

  // `isAdmin: false` volontairement : modérer n'est pas commenter. Un
  // administrateur qui veut agir sur un contenu passe par /moderation.
  return access.canInteract ? { ok: true } : { error: CANNOT_INTERACT };
}

export type ResolvedTarget = {
  target: SocialTarget;
  ownerId: string;
  /** Masqué par la modération — on n'interagit pas avec ce qui est masqué. */
  hidden: boolean;
  /** Libellé figé, pour un signalement ou une notification. */
  label: string;
  /** De quoi construire le permalien (`targetHref`). */
  slug: string | null;
  workId: string | null;
  /** Extrait du texte visé, pour l'instantané d'un signalement. */
  text: string | null;
};

/**
 * Résout une cible sociale en son propriétaire et son contexte.
 *
 * Renvoie `null` si la cible n'existe pas. Les trois branches sont explicites
 * plutôt que génériques : chaque nature a son `select` propre, et un `switch`
 * exhaustif oblige à traiter une quatrième nature le jour où elle arrivera.
 */
export async function resolveTarget(
  target: SocialTarget,
): Promise<ResolvedTarget | null> {
  const where = targetWhere(target);

  switch (target.kind) {
    case "entry": {
      const row = await db.journalEntry.findUnique({
        where: { id: where.journalEntryId! },
        select: {
          userId: true,
          hiddenAt: true,
          reviewText: true,
          workId: true,
          work: { select: { titleFr: true } },
        },
      });
      if (!row) return null;
      return {
        target,
        ownerId: row.userId,
        hidden: row.hiddenAt !== null,
        label: row.work.titleFr,
        slug: null,
        workId: row.workId,
        text: row.reviewText,
      };
    }
    case "list": {
      const row = await db.list.findUnique({
        where: { id: where.listId! },
        select: {
          userId: true,
          hiddenAt: true,
          isPrivate: true,
          title: true,
          slug: true,
          description: true,
        },
      });
      if (!row) return null;
      return {
        target,
        ownerId: row.userId,
        // Une liste rendue privée par son auteur ne se commente pas davantage
        // qu'une liste masquée : dans les deux cas elle a quitté les surfaces
        // sociales.
        hidden: row.hiddenAt !== null || row.isPrivate,
        label: row.title,
        slug: row.slug,
        workId: null,
        text: row.description,
      };
    }
    case "review": {
      const row = await db.userWork.findUnique({
        where: { id: where.userWorkId! },
        select: {
          userId: true,
          hiddenAt: true,
          reviewText: true,
          workId: true,
          work: { select: { titleFr: true } },
        },
      });
      if (!row) return null;
      return {
        target,
        ownerId: row.userId,
        // Une fiche de suivi sans critique n'est pas un objet social : on ne
        // commente pas un statut, seulement un écrit.
        hidden: row.hiddenAt !== null || !row.reviewText,
        label: row.work.titleFr,
        slug: null,
        workId: row.workId,
        text: row.reviewText,
      };
    }
  }
}

/**
 * Le chemin complet d'un geste social : la cible existe, elle n'est pas
 * masquée, et le visiteur a le droit d'agir dessus.
 */
export async function resolveInteractable(
  viewerId: string,
  target: SocialTarget,
): Promise<{ ok: true; resolved: ResolvedTarget } | { error: string }> {
  const resolved = await resolveTarget(target);
  if (!resolved) return { error: TARGET_GONE };
  if (resolved.hidden) {
    return {
      error: `Cette ${TARGET_LABELS[target.kind]} n'est plus accessible.`,
    };
  }

  const allowed = await assertCanInteract(viewerId, resolved.ownerId);
  if ("error" in allowed) return allowed;

  return { ok: true, resolved };
}
