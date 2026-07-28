"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertCanInteract } from "@/lib/social/guard";
import { notify } from "@/lib/social/notify";
import {
  revalidateFeed,
  revalidateNotifications,
  revalidateProfile,
} from "./revalidate";
import type { ActionResult } from "./status";

/**
 * Abonnements (lot 4, P2).
 *
 * Un compte privé (D26) place la demande en PENDING, tout autre la crée
 * directement ACCEPTED. Le statut n'est pas décoratif : `resolveAccess` n'ouvre
 * un compte privé qu'à un abonnement **accepté**, et le fil ne lit que les
 * ACCEPTED.
 *
 * `followerId != followingId` ne se déclare pas en Prisma (pas de CHECK) :
 * l'invariant vit ici, comme le plafond de quatre favoris au lot 3.
 */

const SELF = "On ne peut pas s'abonner à soi-même.";
const NOT_FOUND = "Membre introuvable.";

export async function followUser(targetUserId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (targetUserId === user.id) return { error: SELF };

  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, username: true, visibility: true, banned: true },
  });
  if (!target || target.banned) return { error: NOT_FOUND };

  const allowed = await assertCanInteract(user.id, targetUserId);
  if ("error" in allowed) return allowed;

  const pending = target.visibility === "PRIVATE";

  await db.$transaction(async (tx) => {
    await tx.follow.upsert({
      where: {
        followerId_followingId: {
          followerId: user.id,
          followingId: targetUserId,
        },
      },
      // Un second clic ne rétrograde pas un abonnement déjà accepté en attente.
      update: {},
      create: {
        followerId: user.id,
        followingId: targetUserId,
        status: pending ? "PENDING" : "ACCEPTED",
        acceptedAt: pending ? null : new Date(),
      },
    });

    // Dans la même transaction : un abonnement qui échoue ne doit pas laisser
    // derrière lui une notification annonçant un abonné qui n'existe pas.
    await notify(tx, {
      userId: targetUserId,
      actorId: user.id,
      type: pending ? "FOLLOW_REQUEST" : "FOLLOW",
    });
  });

  revalidateProfile(target.username);
  revalidateFeed();
  revalidateNotifications();
  return { ok: true };
}

export async function unfollowUser(
  targetUserId: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { username: true },
  });

  // deleteMany : se désabonner de ce à quoi on n'est pas abonné n'est pas une
  // erreur, c'est déjà l'état voulu.
  await db.follow.deleteMany({
    where: { followerId: user.id, followingId: targetUserId },
  });

  revalidateProfile(target?.username ?? null);
  revalidateFeed();
  return { ok: true };
}

/**
 * Accepter une demande d'abonnement (compte privé).
 *
 * C'est le **destinataire** qui accepte : le filtre porte sur `followingId`,
 * jamais sur `followerId` — sans quoi un demandeur pourrait s'auto-approuver.
 */
export async function acceptFollowRequest(
  followId: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const follow = await db.follow.findFirst({
    where: { id: followId, followingId: user.id, status: "PENDING" },
    select: { id: true, followerId: true },
  });
  if (!follow) return { error: "Demande introuvable." };

  await db.$transaction(async (tx) => {
    await tx.follow.update({
      where: { id: followId },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    await notify(tx, {
      userId: follow.followerId,
      actorId: user.id,
      type: "FOLLOW_ACCEPTED",
    });
  });

  revalidateFeed();
  revalidateNotifications();
  return { ok: true };
}

export async function rejectFollowRequest(
  followId: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const follow = await db.follow.findFirst({
    where: { id: followId, followingId: user.id, status: "PENDING" },
    select: { id: true },
  });
  if (!follow) return { error: "Demande introuvable." };

  await db.follow.delete({ where: { id: followId } });

  revalidateFeed();
  return { ok: true };
}

/** Retirer un abonné — le pendant doux du blocage. */
export async function removeFollower(
  followerId: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const deleted = await db.follow.deleteMany({
    where: { followerId, followingId: user.id },
  });
  if (deleted.count === 0) return { error: "Abonné introuvable." };

  revalidateFeed();
  return { ok: true };
}
