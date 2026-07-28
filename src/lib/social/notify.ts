import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { NotificationType } from "@/generated/prisma/enums";
import { shouldNotify } from "@/lib/notify-rules";
import { targetColumns, type SocialTarget } from "@/lib/social-target";

/**
 * Écriture des notifications (lot 4, P3).
 *
 * `notify` prend un client de transaction et non `db` : une notification est
 * créée **dans la transaction du geste qui la motive**. Une écriture qui
 * échoue ne doit jamais laisser derrière elle une notification fantôme
 * annonçant un commentaire qui n'existe pas.
 *
 * La décision vit dans `src/lib/notify-rules.ts`, sans base ; ce module ne fait
 * que charger les deux faits qui lui manquent et écrire.
 */

export type NotifyArgs = {
  /** Destinataire. */
  userId: string;
  /** Auteur du geste — `null` pour une notification système (modération). */
  actorId: string | null;
  type: NotificationType;
  target?: SocialTarget;
  workId?: string;
  commentId?: string;
};

function targetFilter(target?: SocialTarget) {
  if (!target) return {};
  const cols = targetColumns(target);
  // Un `where` sur les trois colonnes : ici on cherche l'identité exacte d'une
  // notification, donc les NULL comptent — contrairement à `targetWhere`, qui
  // sert à trouver des lignes par cible.
  return cols;
}

export async function notify(
  tx: Prisma.TransactionClient,
  args: NotifyArgs,
): Promise<void> {
  const blocked =
    args.actorId === null
      ? false
      : (await tx.block.count({
          where: {
            OR: [
              { blockerId: args.userId, blockedId: args.actorId },
              { blockerId: args.actorId, blockedId: args.userId },
            ],
          },
        })) > 0;

  const hasUnreadIdentical =
    (await tx.notification.count({
      where: {
        userId: args.userId,
        actorId: args.actorId,
        type: args.type,
        readAt: null,
        ...targetFilter(args.target),
      },
    })) > 0;

  if (
    !shouldNotify({
      recipientId: args.userId,
      actorId: args.actorId,
      blocked,
      hasUnreadIdentical,
    })
  ) {
    return;
  }

  await tx.notification.create({
    data: {
      userId: args.userId,
      actorId: args.actorId,
      type: args.type,
      commentId: args.commentId ?? null,
      workId: args.workId ?? null,
      ...(args.target
        ? targetColumns(args.target)
        : { journalEntryId: null, listId: null, userWorkId: null }),
    },
  });
}

/**
 * Retire la notification qu'un geste annulé avait produite.
 *
 * Un j'aime qu'on retire ne doit pas laisser de trace : c'est le pendant
 * naturel du regroupement. Seules les non lues partent — une notification déjà
 * lue appartient à l'histoire du destinataire, pas à l'acteur.
 */
export async function unnotify(
  tx: Prisma.TransactionClient,
  args: { userId: string; actorId: string; type: NotificationType; target: SocialTarget },
): Promise<void> {
  await tx.notification.deleteMany({
    where: {
      userId: args.userId,
      actorId: args.actorId,
      type: args.type,
      readAt: null,
      ...targetColumns(args.target),
    },
  });
}

/**
 * Notifie tous les administrateurs (D30 : « le créateur **et**
 * l'administrateur »).
 *
 * `shouldNotify` s'applique à chacun : un administrateur qui propose lui-même
 * une correction ne reçoit pas sa propre notification.
 */
export async function notifyAdmins(
  tx: Prisma.TransactionClient,
  args: Omit<NotifyArgs, "userId"> & { except?: string[] },
): Promise<void> {
  const admins = await tx.user.findMany({
    where: { role: "admin", banned: false },
    select: { id: true },
  });

  const skip = new Set(args.except ?? []);
  for (const admin of admins) {
    if (skip.has(admin.id)) continue;
    await notify(tx, { ...args, userId: admin.id });
  }
}
