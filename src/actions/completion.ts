"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import type { ActionResult } from "@/actions/status";

const idSchema = z.string().min(1);

/**
 * Retire le drapeau « à compléter » d'une fiche importée sans passer par le
 * formulaire complet — pour les fiches qu'on juge assez renseignées telles
 * quelles. Réservé au créateur et à l'administrateur (D30), comme l'édition.
 */
export async function markWorkCompleted(workId: string): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = idSchema.safeParse(workId);
  if (!parsed.success) return { error: "Fiche invalide." };

  const work = await db.work.findUnique({
    where: { id: parsed.data },
    select: { id: true, createdById: true },
  });
  if (!work) return { error: "Fiche introuvable." };
  if (work.createdById !== user.id && !isAdmin(user)) {
    return {
      error: "Seul le créateur ou l'administrateur peut modifier cette fiche.",
    };
  }

  await db.work.update({
    where: { id: work.id },
    data: { needsCompletion: false },
  });

  revalidatePath("/a-completer");
  revalidatePath(`/oeuvre/${work.id}`);
  return { ok: true };
}
