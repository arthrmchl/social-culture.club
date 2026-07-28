"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import {
  revalidateFeed,
  revalidateNotifications,
  revalidateProfile,
} from "./revalidate";
import type { ActionResult } from "./status";

/**
 * Blocage (lot 4, D25, P4).
 *
 * Stocké dans **un** sens, appliqué dans **les deux** : `blockedUserIds` s'en
 * charge à la lecture. Bloquer coupe donc la visibilité et l'interaction des
 * deux côtés, ce qui est la seule définition utile du geste.
 *
 * Ce que le blocage **ne fait pas** : supprimer les j'aime et les commentaires
 * déjà posés. Ils sont masqués à la lecture, ce qui rend le déblocage
 * réversible — un blocage regretté ne détruit rien. Les abonnements et les
 * notifications, eux, partent : ce sont des liens vivants, pas des écrits.
 */

const SELF = "On ne peut pas se bloquer soi-même.";

export async function blockUser(
  targetUserId: string,
  reason?: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (targetUserId === user.id) return { error: SELF };

  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, username: true },
  });
  if (!target) return { error: "Membre introuvable." };

  await db.$transaction(async (tx) => {
    await tx.block.upsert({
      where: {
        blockerId_blockedId: { blockerId: user.id, blockedId: targetUserId },
      },
      update: { reason: reason?.trim() || null },
      create: {
        blockerId: user.id,
        blockedId: targetUserId,
        reason: reason?.trim() || null,
      },
    });

    // Les deux sens : bloquer quelqu'un, c'est aussi cesser de le suivre.
    await tx.follow.deleteMany({
      where: {
        OR: [
          { followerId: user.id, followingId: targetUserId },
          { followerId: targetUserId, followingId: user.id },
        ],
      },
    });

    // Les notifications croisées n'ont plus lieu d'être — et en laisser
    // rendrait le blocage bavard.
    await tx.notification.deleteMany({
      where: {
        OR: [
          { userId: user.id, actorId: targetUserId },
          { userId: targetUserId, actorId: user.id },
        ],
      },
    });
  });

  revalidateProfile(target.username);
  revalidateFeed();
  revalidateNotifications();
  return { ok: true };
}

export async function unblockUser(
  targetUserId: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { username: true },
  });

  // Débloquer ne rétablit pas l'abonnement : c'est au membre de le refaire.
  await db.block.deleteMany({
    where: { blockerId: user.id, blockedId: targetUserId },
  });

  revalidateProfile(target?.username ?? null);
  revalidateFeed();
  return { ok: true };
}
