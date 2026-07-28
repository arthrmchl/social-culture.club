"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { notify } from "@/lib/social/notify";
import { revalidateNotifications, revalidateProfile } from "./revalidate";

/**
 * Réglages de visibilité du compte (lot 4, D26, P5).
 *
 * Trois niveaux et deux drapeaux de section, qui ne peuvent que retrancher —
 * la règle de composition vit dans `src/lib/visibility.ts`, jamais ici.
 */

export type VisibilityState =
  | { error: string }
  | { success: true }
  | undefined;

const schema = z.object({
  visibility: z.enum(["PUBLIC", "MEMBERS", "PRIVATE"], {
    message: "Visibilité inconnue.",
  }),
  showJournalPublicly: z.coerce.boolean(),
  showStatsPublicly: z.coerce.boolean(),
});

const NEEDS_USERNAME =
  "Choisissez d'abord un nom d'utilisateur : c'est l'adresse de votre profil.";

export async function updateVisibility(
  _prev: VisibilityState,
  formData: FormData,
): Promise<VisibilityState> {
  const user = await requireUser();

  const parsed = schema.safeParse({
    visibility: formData.get("visibility"),
    // Une case décochée n'est pas envoyée : l'absence vaut faux.
    showJournalPublicly: formData.get("showJournalPublicly") ? "1" : "",
    showStatsPublicly: formData.get("showStatsPublicly") ? "1" : "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Réglages invalides." };
  }
  const d = parsed.data;

  const me = await db.user.findUnique({
    where: { id: user.id },
    select: { username: true, visibility: true },
  });
  if (!me) return { error: "Compte introuvable." };

  // Un profil ouvert sans pseudonyme n'aurait pas d'URL : on refuse plutôt que
  // de laisser un réglage sans effet visible.
  if (d.visibility !== "PRIVATE" && !me.username) {
    return { error: NEEDS_USERNAME };
  }

  const opening = me.visibility === "PRIVATE" && d.visibility !== "PRIVATE";

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        visibility: d.visibility,
        showJournalPublicly: d.showJournalPublicly,
        showStatsPublicly: d.showStatsPublicly,
      },
    });

    if (opening) {
      // En quittant le compte privé, les demandes en attente n'ont plus de
      // raison d'attendre. Les laisser en PENDING créerait une incohérence
      // qu'aucun test unitaire ne verrait mais qu'un usage réel révèle tout de
      // suite : le demandeur voit le profil (il est ouvert) et garde pourtant
      // un fil vide, parce que le fil ne lit que les ACCEPTED.
      const waiting = await tx.follow.findMany({
        where: { followingId: user.id, status: "PENDING" },
        select: { followerId: true },
      });
      await tx.follow.updateMany({
        where: { followingId: user.id, status: "PENDING" },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });
      for (const w of waiting) {
        await notify(tx, {
          userId: w.followerId,
          actorId: user.id,
          type: "FOLLOW_ACCEPTED",
        });
      }
    }
  });

  revalidateProfile(me.username);
  revalidateNotifications();
  return { success: true };
}
