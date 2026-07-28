"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { revalidateNotifications } from "./revalidate";
import type { ActionResult } from "./status";

/**
 * Boîte de réception (lot 4, P3).
 *
 * Une notification est une donnée strictement individuelle, au même titre
 * qu'une entrée de journal : toutes les écritures se referment sur `userId`,
 * y compris pour l'administrateur.
 */

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const user = await requireUser();

  await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidateNotifications();
  return { ok: true };
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  const user = await requireUser();

  // updateMany plutôt qu'update : le filtre porte sur userId, donc marquer la
  // notification d'un autre ne peut pas réussir par erreur.
  const res = await db.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  if (res.count === 0) return { error: "Notification introuvable." };

  revalidateNotifications();
  return { ok: true };
}

export async function deleteNotification(id: string): Promise<ActionResult> {
  const user = await requireUser();

  const res = await db.notification.deleteMany({
    where: { id, userId: user.id },
  });
  if (res.count === 0) return { error: "Notification introuvable." };

  revalidateNotifications();
  return { ok: true };
}
