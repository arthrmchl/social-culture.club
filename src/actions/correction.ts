"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/session";
import { notify, notifyAdmins } from "@/lib/social/notify";
import { revalidateModeration, revalidateNotifications } from "./revalidate";
import { revalidateWork } from "./revalidate";
import type { ActionResult } from "./status";

/**
 * Propositions de correction (lot 4, D30).
 *
 * Le contrepoids au droit d'édition réservé au créateur et à l'administrateur.
 * Sans lui, une fiche dont le créateur ne s'occupe plus reste figée pour toute
 * l'instance — c'est le risque R8, et c'est la seule mitigation prévue.
 *
 * D30 dit « notifie le créateur **et** l'administrateur » : les deux, pas l'un
 * ou l'autre. Un créateur absent est précisément le cas qu'on veut couvrir.
 */

export type CorrectionState =
  | { error: string }
  | { success: true }
  | undefined;

const schema = z.object({
  field: z.string().max(60).optional(),
  message: z
    .string()
    .min(1, "Décrivez la correction proposée.")
    .max(2000, "La proposition ne peut pas dépasser 2000 caractères."),
});

export async function suggestCorrection(
  workId: string,
  _prev: CorrectionState,
  formData: FormData,
): Promise<CorrectionState> {
  const user = await requireUser();

  const parsed = schema.safeParse({
    field: formData.get("field") || undefined,
    message: formData.get("message"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Proposition invalide." };
  }

  const work = await db.work.findUnique({
    where: { id: workId },
    select: { id: true, titleFr: true, createdById: true },
  });
  if (!work) return { error: "Œuvre introuvable." };

  // Le créateur édite, il ne se propose rien à lui-même.
  if (work.createdById === user.id) {
    return { error: "Cette fiche est la vôtre : modifiez-la directement." };
  }

  const existing = await db.correctionSuggestion.findFirst({
    where: { workId, authorId: user.id, status: "OPEN" },
    select: { id: true },
  });
  if (existing) {
    return { error: "Vous avez déjà une proposition en attente sur cette fiche." };
  }

  await db.$transaction(async (tx) => {
    await tx.correctionSuggestion.create({
      data: {
        workId,
        authorId: user.id,
        field: parsed.data.field?.trim() || null,
        message: parsed.data.message.trim(),
      },
    });

    await notify(tx, {
      userId: work.createdById,
      actorId: user.id,
      type: "CORRECTION",
      workId,
    });
    // `except` évite qu'un administrateur créateur de la fiche reçoive deux
    // fois la même notification.
    await notifyAdmins(tx, {
      actorId: user.id,
      type: "CORRECTION",
      workId,
      except: [work.createdById],
    });
  });

  revalidateWork(workId);
  revalidateModeration();
  revalidateNotifications();
  return { success: true };
}

/**
 * Traiter une proposition.
 *
 * Ouverte au créateur de la fiche comme à l'administrateur — les deux qui
 * peuvent l'appliquer (D30). « Appliquée » ne modifie pas la fiche : c'est un
 * classement, l'édition se fait sur le formulaire d'œuvre.
 */
export async function resolveCorrection(
  id: string,
  decision: "APPLIED" | "REJECTED",
): Promise<ActionResult> {
  const user = await requireUser();

  const suggestion = await db.correctionSuggestion.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      workId: true,
      work: { select: { createdById: true } },
    },
  });
  if (!suggestion) return { error: "Proposition introuvable." };
  if (suggestion.work.createdById !== user.id && !isAdmin(user)) {
    return { error: "Proposition introuvable." };
  }
  if (suggestion.status !== "OPEN") return { error: "Proposition déjà traitée." };

  await db.correctionSuggestion.update({
    where: { id },
    data: { status: decision, handledAt: new Date(), handledById: user.id },
  });

  revalidateWork(suggestion.workId);
  revalidateModeration();
  return { ok: true };
}
