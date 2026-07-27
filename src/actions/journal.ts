"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { revalidateWork } from "./revalidate";
import { starsToScore } from "@/lib/rating";
import { recomputeViewings } from "@/lib/tracking";
import type { ActionResult } from "./status";

const entrySchema = z.object({
  workId: z.string().min(1),
  seasonId: z.string().optional(),
  episodeId: z.string().optional(),
  tomeId: z.string().optional(),
  editionId: z.string().optional(),
  loggedAt: z.string().datetime().nullable().optional(),
  datePrecision: z.enum(["DAY", "MONTH", "YEAR", "UNKNOWN"]).optional(),
  stars: z.number().min(0.5).max(5).nullable().optional(),
  reviewText: z.string().max(20000).optional(),
  reviewHasSpoiler: z.boolean().optional(),
  isRewatch: z.boolean().optional(),
  context: z.string().max(200).optional(),
});

export type JournalEntryInput = z.input<typeof entrySchema>;

function resolveDate(
  loggedAt: string | null | undefined,
  precision: "DAY" | "MONTH" | "YEAR" | "UNKNOWN" | undefined,
): {
  loggedAt: Date | null;
  datePrecision: "DAY" | "MONTH" | "YEAR" | "UNKNOWN";
} {
  if (loggedAt === null) return { loggedAt: null, datePrecision: "UNKNOWN" };
  if (loggedAt === undefined)
    return { loggedAt: new Date(), datePrecision: precision ?? "DAY" };
  return { loggedAt: new Date(loggedAt), datePrecision: precision ?? "DAY" };
}

/** Consigne une consommation dans le journal (S4). */
export async function createJournalEntry(
  input: JournalEntryInput,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Entrée invalide." };
  }
  const d = parsed.data;

  const work = await db.work.findUnique({
    where: { id: d.workId },
    select: { type: true },
  });
  if (!work) return { error: "Œuvre introuvable." };

  const rating = d.stars == null ? null : starsToScore(d.stars);
  const review = d.reviewText?.trim() || null;
  const { loggedAt, datePrecision } = resolveDate(d.loggedAt, d.datePrecision);

  await db.$transaction(async (tx) => {
    await tx.journalEntry.create({
      data: {
        userId: user.id,
        workId: d.workId,
        seasonId: d.seasonId || null,
        episodeId: d.episodeId || null,
        tomeId: d.tomeId || null,
        editionId: d.editionId || null,
        loggedAt,
        datePrecision,
        rating,
        reviewText: review,
        reviewHasSpoiler: review ? !!d.reviewHasSpoiler : false,
        isRewatch: !!d.isRewatch,
        context: d.context?.trim() || null,
      },
    });

    // La note du visionnage devient la note actuelle (comportement Letterboxd).
    const uw = await tx.userWork.findUnique({
      where: { userId_workId: { userId: user.id, workId: d.workId } },
      select: { state: true },
    });

    // Consigner un film vaut « vu » : bascule COMPLETED s'il n'a pas d'état actif.
    const filmDone =
      work.type === "FILM" && (uw?.state == null || uw.state === "WANT");

    await tx.userWork.upsert({
      where: { userId_workId: { userId: user.id, workId: d.workId } },
      update: {
        ...(rating != null ? { currentRating: rating } : {}),
        ...(filmDone
          ? { state: "COMPLETED", finishedAt: loggedAt ?? new Date() }
          : {}),
      },
      create: {
        userId: user.id,
        workId: d.workId,
        ...(rating != null ? { currentRating: rating } : {}),
        ...(filmDone
          ? { state: "COMPLETED", finishedAt: loggedAt ?? new Date() }
          : {}),
      },
    });

    await recomputeViewings(tx, user.id, d.workId);
  });

  revalidateWork(d.workId);
  return { ok: true };
}

const editSchema = entrySchema
  .omit({ workId: true, seasonId: true, episodeId: true, tomeId: true })
  .partial();

/** Édition d'une entrée de journal — réservée à son auteur. */
export async function editJournalEntry(
  entryId: string,
  input: z.input<typeof editSchema>,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return { error: "Entrée invalide." };
  const d = parsed.data;

  const entry = await db.journalEntry.findUnique({
    where: { id: entryId },
    select: { userId: true, workId: true },
  });
  if (!entry || entry.userId !== user.id) {
    return { error: "Entrée introuvable." };
  }

  const rating =
    d.stars === undefined
      ? undefined
      : d.stars === null
        ? null
        : starsToScore(d.stars);
  const review =
    d.reviewText === undefined ? undefined : d.reviewText.trim() || null;
  const datePatch =
    d.loggedAt === undefined ? {} : resolveDate(d.loggedAt, d.datePrecision);

  await db.journalEntry.update({
    where: { id: entryId },
    data: {
      ...(rating === undefined ? {} : { rating }),
      ...(review === undefined
        ? {}
        : {
            reviewText: review,
            reviewHasSpoiler: review ? !!d.reviewHasSpoiler : false,
          }),
      ...(d.isRewatch === undefined ? {} : { isRewatch: d.isRewatch }),
      ...(d.context === undefined ? {} : { context: d.context.trim() || null }),
      ...datePatch,
    },
  });

  revalidateWork(entry.workId);
  return { ok: true };
}

/** Suppression d'une entrée de journal. */
export async function deleteJournalEntry(
  entryId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const entry = await db.journalEntry.findUnique({
    where: { id: entryId },
    select: { userId: true, workId: true },
  });
  if (!entry || entry.userId !== user.id) {
    return { error: "Entrée introuvable." };
  }

  await db.$transaction(async (tx) => {
    await tx.journalEntry.delete({ where: { id: entryId } });
    await recomputeViewings(tx, user.id, entry.workId);
  });

  revalidateWork(entry.workId);
  return { ok: true };
}
