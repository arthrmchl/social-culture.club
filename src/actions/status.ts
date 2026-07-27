"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { starsToScore } from "@/lib/rating";
import { isStateAllowed } from "@/lib/status";
import type { WorkStatusState } from "@/generated/prisma/enums";

export type ActionResult = { ok: true } | { error: string };

async function workType(workId: string) {
  const w = await db.work.findUnique({
    where: { id: workId },
    select: { type: true },
  });
  return w?.type ?? null;
}

function revalidateWork(workId: string) {
  revalidatePath(`/oeuvre/${workId}`);
  revalidatePath("/");
  revalidatePath("/journal");
  revalidatePath("/watchlist");
}

/** Statut par œuvre (S8, T2, L1). `null` retire tout statut. */
export async function setStatus(
  workId: string,
  state: WorkStatusState | null,
): Promise<ActionResult> {
  const user = await requireUser();
  const type = await workType(workId);
  if (!type) return { error: "Œuvre introuvable." };
  if (state && !isStateAllowed(type, state)) {
    return { error: "Statut invalide pour ce média." };
  }

  const existing = await db.userWork.findUnique({
    where: { userId_workId: { userId: user.id, workId } },
    select: { startedAt: true, finishedAt: true, watchlistedAt: true },
  });

  const now = new Date();
  const patch: {
    state: WorkStatusState | null;
    watchlistedAt?: Date | null;
    startedAt?: Date;
    finishedAt?: Date;
  } = { state };

  if (state === "WANT" && !existing?.watchlistedAt) patch.watchlistedAt = now;
  if (state === "IN_PROGRESS" && !existing?.startedAt) patch.startedAt = now;
  if (
    (state === "COMPLETED" || state === "CAUGHT_UP") &&
    !existing?.finishedAt
  ) {
    patch.finishedAt = now;
  }

  await db.userWork.upsert({
    where: { userId_workId: { userId: user.id, workId } },
    update: patch,
    create: { userId: user.id, workId, ...patch },
  });

  revalidateWork(workId);
  return { ok: true };
}

const starsSchema = z.number().min(0.5).max(5).nullable();

/** Note actuelle, modifiable hors journal (S5). `null` efface la note. */
export async function setRating(
  workId: string,
  stars: number | null,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = starsSchema.safeParse(stars);
  if (!parsed.success) return { error: "Note invalide." };

  const score = parsed.data === null ? null : starsToScore(parsed.data);
  await db.userWork.upsert({
    where: { userId_workId: { userId: user.id, workId } },
    update: { currentRating: score },
    create: { userId: user.id, workId, currentRating: score },
  });

  revalidateWork(workId);
  return { ok: true };
}

/** J'aime, indépendant de la note (S6). */
export async function toggleLike(workId: string): Promise<ActionResult> {
  const user = await requireUser();
  const existing = await db.userWork.findUnique({
    where: { userId_workId: { userId: user.id, workId } },
    select: { liked: true },
  });
  const liked = !(existing?.liked ?? false);
  await db.userWork.upsert({
    where: { userId_workId: { userId: user.id, workId } },
    update: { liked },
    create: { userId: user.id, workId, liked },
  });

  revalidateWork(workId);
  return { ok: true };
}

const reviewSchema = z.object({
  text: z.string().max(20000),
  spoiler: z.boolean().optional(),
});

/** Critique rattachée directement à l'œuvre (S7). */
export async function setWorkReview(
  workId: string,
  input: { text: string; spoiler?: boolean },
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { error: "Critique invalide." };
  const text = parsed.data.text.trim();

  await db.userWork.upsert({
    where: { userId_workId: { userId: user.id, workId } },
    update: {
      reviewText: text || null,
      reviewHasSpoiler: text ? !!parsed.data.spoiler : false,
      reviewedAt: text ? new Date() : null,
    },
    create: {
      userId: user.id,
      workId,
      reviewText: text || null,
      reviewHasSpoiler: text ? !!parsed.data.spoiler : false,
      reviewedAt: text ? new Date() : null,
    },
  });

  revalidateWork(workId);
  return { ok: true };
}

const progressSchema = z.object({
  page: z.number().int().min(0).nullable().optional(),
  percent: z.number().int().min(0).max(100).nullable().optional(),
  editionId: z.string().optional(),
});

/** Progression de lecture (L2) : historise + met à jour le cache du statut. */
export async function updateReadingProgress(
  workId: string,
  input: { page?: number | null; percent?: number | null; editionId?: string },
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = progressSchema.safeParse(input);
  if (!parsed.success) return { error: "Progression invalide." };
  const { page, percent, editionId } = parsed.data;
  if (page == null && percent == null) {
    return { error: "Renseignez une page ou un pourcentage." };
  }

  await db.$transaction(async (tx) => {
    await tx.readingProgress.create({
      data: {
        userId: user.id,
        workId,
        editionId: editionId || null,
        page: page ?? null,
        percent: percent ?? null,
      },
    });

    const uw = await tx.userWork.findUnique({
      where: { userId_workId: { userId: user.id, workId } },
      select: { state: true, startedAt: true },
    });
    const now = new Date();
    // Une progression enregistrée implique une lecture en cours (sauf état terminal).
    const startsReading =
      uw?.state == null || uw.state === "WANT" || uw.state === "IN_PROGRESS";

    await tx.userWork.upsert({
      where: { userId_workId: { userId: user.id, workId } },
      update: {
        currentPage: page ?? undefined,
        progressPercent: percent ?? undefined,
        ...(startsReading
          ? { state: "IN_PROGRESS", startedAt: uw?.startedAt ?? now }
          : {}),
      },
      create: {
        userId: user.id,
        workId,
        currentPage: page ?? null,
        progressPercent: percent ?? null,
        state: "IN_PROGRESS",
        startedAt: now,
      },
    });
  });

  revalidateWork(workId);
  return { ok: true };
}
