"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { isAdmin, requireUser } from "@/lib/session";
import { resolveTarget } from "@/lib/social/guard";
import { notify } from "@/lib/social/notify";
import {
  socialTargetSchema,
  targetColumns,
  type SocialTarget,
} from "@/lib/social-target";
import { buildExcerpt, buildLabel, REPORT_REASONS } from "@/lib/moderation";
import type { ReportTargetKind } from "@/generated/prisma/enums";
import {
  revalidateFeed,
  revalidateModeration,
  revalidateNotifications,
  revalidateSocialTarget,
} from "./revalidate";
import type { ActionResult } from "./status";

/**
 * Signalement et modération (lot 4, D25, P4).
 *
 * Aucun filtrage automatique : D25 l'exclut. Un signalement décrit, un humain
 * décide.
 *
 * L'instantané (`targetKind`, `targetLabel`, `targetExcerpt`) est figé à la
 * création parce que les clés étrangères d'un `Report` sont en SetNull : si
 * l'administrateur supprime le contenu incriminé, c'est tout ce qui reste pour
 * comprendre ce qui avait été signalé.
 */

const ADMIN_ONLY = "Réservé à l'administration.";
const ALREADY = "Vous avez déjà signalé ce contenu.";

const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS as [string, ...string[]], {
    message: "Motif de signalement inconnu.",
  }),
  details: z.string().max(2000).optional(),
});

const KIND_OF: Record<SocialTarget["kind"], ReportTargetKind> = {
  entry: "JOURNAL_ENTRY",
  list: "LIST",
  review: "REVIEW",
};

export async function reportContent(input: {
  target: SocialTarget;
  reason: string;
  details?: string;
}): Promise<ActionResult> {
  const user = await requireUser();

  const parsedTarget = socialTargetSchema.safeParse(input.target);
  if (!parsedTarget.success) {
    return {
      error: parsedTarget.error.issues[0]?.message ?? "Cible invalide.",
    };
  }
  const parsed = reportSchema.safeParse({
    reason: input.reason,
    details: input.details,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Signalement invalide." };
  }

  const resolved = await resolveTarget(parsedTarget.data);
  if (!resolved) return { error: "Contenu introuvable." };
  if (resolved.ownerId === user.id) {
    return { error: "Vous ne pouvez pas signaler votre propre contenu." };
  }

  const cols = targetColumns(parsedTarget.data);

  // « Un signalement ouvert par rapporteur et par cible » ne se déclare pas en
  // base : reporterId est nullable (SetNull), et deux rapporteurs supprimés
  // produiraient deux NULL que PostgreSQL considère distincts.
  const existing = await db.report.findFirst({
    where: { reporterId: user.id, status: "OPEN", ...cols },
    select: { id: true },
  });
  if (existing) return { error: ALREADY };

  await db.report.create({
    data: {
      reporterId: user.id,
      reportedUserId: resolved.ownerId,
      targetKind: KIND_OF[parsedTarget.data.kind],
      targetLabel: buildLabel(KIND_OF[parsedTarget.data.kind], resolved.label),
      targetExcerpt: buildExcerpt(resolved.text),
      reason: parsed.data.reason as (typeof REPORT_REASONS)[number],
      details: parsed.data.details?.trim() || null,
      workId: resolved.workId,
      ...cols,
    },
  });

  revalidateModeration();
  return { ok: true };
}

export async function reportComment(
  commentId: string,
  reason: string,
  details?: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = reportSchema.safeParse({ reason, details });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Signalement invalide." };
  }

  const comment = await db.comment.findUnique({
    where: { id: commentId },
    select: { id: true, body: true, authorId: true },
  });
  if (!comment) return { error: "Commentaire introuvable." };
  if (comment.authorId === user.id) {
    return { error: "Vous ne pouvez pas signaler votre propre contenu." };
  }

  const existing = await db.report.findFirst({
    where: { reporterId: user.id, commentId, status: "OPEN" },
    select: { id: true },
  });
  if (existing) return { error: ALREADY };

  await db.report.create({
    data: {
      reporterId: user.id,
      reportedUserId: comment.authorId,
      commentId,
      targetKind: "COMMENT",
      targetLabel: buildLabel("COMMENT", buildExcerpt(comment.body, 60)),
      targetExcerpt: buildExcerpt(comment.body),
      reason: parsed.data.reason as (typeof REPORT_REASONS)[number],
      details: parsed.data.details?.trim() || null,
    },
  });

  revalidateModeration();
  return { ok: true };
}

export async function reportUser(
  userId: string,
  reason: string,
  details?: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (userId === user.id) {
    return { error: "Vous ne pouvez pas vous signaler vous-même." };
  }

  const parsed = reportSchema.safeParse({ reason, details });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Signalement invalide." };
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, username: true, bio: true },
  });
  if (!target) return { error: "Membre introuvable." };

  const existing = await db.report.findFirst({
    where: {
      reporterId: user.id,
      reportedUserId: userId,
      targetKind: "USER",
      status: "OPEN",
    },
    select: { id: true },
  });
  if (existing) return { error: "Vous avez déjà signalé ce compte." };

  await db.report.create({
    data: {
      reporterId: user.id,
      reportedUserId: userId,
      targetKind: "USER",
      targetLabel: buildLabel(
        "USER",
        target.username ? `@${target.username}` : target.name,
      ),
      targetExcerpt: buildExcerpt(target.bio),
      reason: parsed.data.reason as (typeof REPORT_REASONS)[number],
      details: parsed.data.details?.trim() || null,
    },
  });

  revalidateModeration();
  return { ok: true };
}

// ─── Gestes d'administration ────────────────────────────────────

export type ReportDecision = "HIDE" | "DELETE" | "REJECT";

/**
 * Traiter un signalement.
 *
 * HIDE masque le contenu, DELETE le supprime (le signalement survit grâce au
 * SetNull et à l'instantané figé), REJECT ferme sans rien toucher. Dans les
 * deux premiers cas, l'auteur est prévenu — on ne fait pas disparaître un écrit
 * en silence.
 */
export async function resolveReport(
  reportId: string,
  decision: ReportDecision,
  note?: string,
): Promise<ActionResult> {
  const user = await requireUser();
  // Vérifié avant toute lecture de la cible : un non-administrateur n'apprend
  // rien de l'existence du signalement.
  if (!isAdmin(user)) return { error: ADMIN_ONLY };

  const report = await db.report.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      status: true,
      targetKind: true,
      journalEntryId: true,
      listId: true,
      userWorkId: true,
      commentId: true,
      reportedUserId: true,
    },
  });
  if (!report) return { error: "Signalement introuvable." };
  if (report.status !== "OPEN") return { error: "Signalement déjà traité." };

  await db.$transaction(async (tx) => {
    if (decision !== "REJECT") {
      const hidden = decision === "HIDE" ? { hiddenAt: new Date() } : null;

      if (report.journalEntryId) {
        if (hidden) {
          await tx.journalEntry.update({
            where: { id: report.journalEntryId },
            data: hidden,
          });
        } else {
          await tx.journalEntry.delete({
            where: { id: report.journalEntryId },
          });
        }
      } else if (report.listId) {
        if (hidden) {
          await tx.list.update({ where: { id: report.listId }, data: hidden });
        } else {
          await tx.list.delete({ where: { id: report.listId } });
        }
      } else if (report.userWorkId) {
        // Une critique se masque, elle ne se supprime pas : le UserWork porte
        // aussi le statut, la note et la progression du membre, que la
        // modération n'a pas à détruire.
        await tx.userWork.update({
          where: { id: report.userWorkId },
          data: { hiddenAt: new Date() },
        });
      } else if (report.commentId) {
        if (hidden) {
          await tx.comment.update({
            where: { id: report.commentId },
            data: hidden,
          });
        } else {
          await tx.comment.delete({ where: { id: report.commentId } });
        }
      }

      if (report.reportedUserId) {
        await notify(tx, {
          userId: report.reportedUserId,
          // Notification système : pas d'acteur, l'administration n'est pas un
          // interlocuteur qu'on puisse suivre ou bloquer.
          actorId: null,
          type: "MODERATION",
        });
      }
    }

    await tx.report.update({
      where: { id: reportId },
      data: {
        status: decision === "REJECT" ? "REJECTED" : "ACCEPTED",
        resolvedAt: new Date(),
        resolvedById: user.id,
        resolution: note?.trim() || null,
      },
    });
  });

  revalidateModeration();
  revalidateFeed();
  revalidateNotifications();
  return { ok: true };
}

/** Masquer un contenu sans passer par un signalement. */
export async function hideContent(
  target: SocialTarget,
  hidden: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isAdmin(user)) return { error: ADMIN_ONLY };

  const parsed = socialTargetSchema.safeParse(target);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Cible invalide." };
  }

  const resolved = await resolveTarget(parsed.data);
  if (!resolved) return { error: "Contenu introuvable." };

  const data = { hiddenAt: hidden ? new Date() : null };
  switch (parsed.data.kind) {
    case "entry":
      await db.journalEntry.update({ where: { id: parsed.data.id }, data });
      break;
    case "list":
      await db.list.update({ where: { id: parsed.data.id }, data });
      break;
    case "review":
      await db.userWork.update({ where: { id: parsed.data.id }, data });
      break;
  }

  revalidateSocialTarget(resolved);
  revalidateModeration();
  revalidateFeed();
  return { ok: true };
}
