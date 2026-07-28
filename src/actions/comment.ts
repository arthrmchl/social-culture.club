"use server";

import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/session";
import { resolveInteractable, resolveTarget } from "@/lib/social/guard";
import {
  socialTargetSchema,
  targetColumns,
  type SocialTarget,
} from "@/lib/social-target";
import {
  COMMENT_TOO_FAST,
  MAX_COMMENTS_PER_MINUTE,
  validateCommentBody,
} from "@/lib/comments";
import { notify } from "@/lib/social/notify";
import {
  revalidateFeed,
  revalidateNotifications,
  revalidateSocialTarget,
} from "./revalidate";
import type { ActionResult } from "./status";

/**
 * Commentaires (lot 4, P3).
 *
 * Le corps est rendu par `<Markdown>` (`src/lib/markdown.tsx`), écrit dès le
 * lot 1 en vue de ce moment : aucun HTML brut, protocoles restreints à
 * http/https/mailto, liens en nofollow. C'est la seule raison pour laquelle on
 * peut accepter du texte d'autrui sans autre précaution.
 *
 * Le plafond de débit relève de l'anti-spam technique, pas de la modération de
 * contenu — D25 exclut explicitement tout filtrage automatique.
 */

export type AddCommentResult = { ok: true; id: string } | { error: string };

export async function addComment(
  target: SocialTarget,
  body: string,
): Promise<AddCommentResult> {
  const user = await requireUser();

  const parsedTarget = socialTargetSchema.safeParse(target);
  if (!parsedTarget.success) {
    return {
      error: parsedTarget.error.issues[0]?.message ?? "Cible invalide.",
    };
  }

  const check = validateCommentBody(body);
  if (!check.ok) return { error: check.error };

  const gate = await resolveInteractable(user.id, parsedTarget.data);
  if ("error" in gate) return gate;

  const recent = await db.comment.count({
    where: {
      authorId: user.id,
      createdAt: { gte: new Date(Date.now() - 60_000) },
    },
  });
  if (recent >= MAX_COMMENTS_PER_MINUTE) return { error: COMMENT_TOO_FAST };

  const comment = await db.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: {
        authorId: user.id,
        body: check.body,
        ...targetColumns(parsedTarget.data),
      },
      select: { id: true },
    });

    // Dans la même transaction : pas de notification annonçant un commentaire
    // qui n'aurait pas été écrit.
    await notify(tx, {
      userId: gate.resolved.ownerId,
      actorId: user.id,
      type: "COMMENT",
      target: parsedTarget.data,
      commentId: created.id,
      workId: gate.resolved.workId ?? undefined,
    });

    return created;
  });

  revalidateSocialTarget(gate.resolved);
  revalidateFeed();
  revalidateNotifications();
  return { ok: true, id: comment.id };
}

/** Modifier son commentaire — l'auteur seul, jamais l'administrateur. */
export async function editComment(
  commentId: string,
  body: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const comment = await db.comment.findFirst({
    where: { id: commentId, authorId: user.id },
    select: { id: true, hiddenAt: true, ...COMMENT_TARGET_SELECT },
  });
  if (!comment) return { error: "Commentaire introuvable." };
  // Réécrire un commentaire masqué reviendrait à défaire la modération.
  if (comment.hiddenAt) {
    return { error: "Ce commentaire a été masqué par la modération." };
  }

  const check = validateCommentBody(body);
  if (!check.ok) return { error: check.error };

  await db.comment.update({
    where: { id: commentId },
    data: { body: check.body },
  });

  await revalidateFromComment(comment);
  return { ok: true };
}

/**
 * Supprimer un commentaire.
 *
 * Trois qualités l'autorisent : son auteur, le propriétaire du contenu
 * commenté — on doit pouvoir faire le ménage chez soi — et l'administrateur.
 */
export async function deleteComment(
  commentId: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const comment = await db.comment.findUnique({
    where: { id: commentId },
    select: { id: true, authorId: true, ...COMMENT_TARGET_SELECT },
  });
  if (!comment) return { error: "Commentaire introuvable." };

  let allowed = comment.authorId === user.id || isAdmin(user);
  if (!allowed) {
    const target = commentTarget(comment);
    const resolved = target ? await resolveTarget(target) : null;
    allowed = resolved?.ownerId === user.id;
  }
  if (!allowed) return { error: "Commentaire introuvable." };

  await db.comment.delete({ where: { id: commentId } });

  await revalidateFromComment(comment);
  return { ok: true };
}

const COMMENT_TARGET_SELECT = {
  journalEntryId: true,
  listId: true,
  userWorkId: true,
} as const;

type CommentTargetRow = {
  journalEntryId: string | null;
  listId: string | null;
  userWorkId: string | null;
};

/**
 * La cible d'un commentaire, ou `null`.
 *
 * `targetFromColumns` lèverait si les trois colonnes étaient nulles ; ici on
 * préfère un `null` silencieux, parce qu'un commentaire dont la cible a été
 * supprimée (cascade) ne doit pas faire échouer une revalidation.
 */
function commentTarget(row: CommentTargetRow): SocialTarget | null {
  if (row.journalEntryId) return { kind: "entry", id: row.journalEntryId };
  if (row.listId) return { kind: "list", id: row.listId };
  if (row.userWorkId) return { kind: "review", id: row.userWorkId };
  return null;
}

async function revalidateFromComment(row: CommentTargetRow): Promise<void> {
  const target = commentTarget(row);
  if (!target) return;
  const resolved = await resolveTarget(target);
  if (resolved) revalidateSocialTarget(resolved);
  revalidateFeed();
}
