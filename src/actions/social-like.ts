"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { resolveInteractable } from "@/lib/social/guard";
import {
  socialTargetSchema,
  targetColumns,
  targetWhere,
  type SocialTarget,
} from "@/lib/social-target";
import { revalidateFeed, revalidateSocialTarget } from "./revalidate";

/**
 * J'aime social (lot 4, P3).
 *
 * À ne surtout pas confondre avec `toggleLike` de `status.ts`, qui bascule
 * `UserWork.liked` — le j'aime **personnel sur l'œuvre** (S6), une donnée de
 * suivi. Ici, on aime ce qu'un membre a écrit ; là, on aime une œuvre. Les
 * libellés d'interface les distinguent aussi (« J'aime cette œuvre » contre
 * « J'aime »), et les deux compteurs ne doivent jamais se mélanger.
 */

export type LikeResult =
  | { ok: true; liked: boolean; count: number }
  | { error: string };

export async function toggleSocialLike(
  target: SocialTarget,
): Promise<LikeResult> {
  const user = await requireUser();

  const parsed = socialTargetSchema.safeParse(target);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Cible invalide." };
  }

  // Existence, masquage, blocage et visibilité, en une passe et en un seul
  // endroit : aucune action sociale n'interroge Block elle-même.
  const gate = await resolveInteractable(user.id, parsed.data);
  if ("error" in gate) return gate;

  const where = targetWhere(parsed.data);

  const { liked, count } = await db.$transaction(async (tx) => {
    const existing = await tx.socialLike.findFirst({
      where: { userId: user.id, ...where },
      select: { id: true },
    });

    if (existing) {
      await tx.socialLike.delete({ where: { id: existing.id } });
    } else {
      await tx.socialLike.create({
        data: { userId: user.id, ...targetColumns(parsed.data) },
      });
    }

    // Recompté dans la transaction : le bouton affiche un nombre juste, pas un
    // incrément optimiste qui divergerait à deux onglets ouverts.
    const count = await tx.socialLike.count({ where });
    return { liked: !existing, count };
  });

  revalidateSocialTarget(gate.resolved);
  revalidateFeed();
  return { ok: true, liked, count };
}
