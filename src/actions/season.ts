"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { starsToScore } from "@/lib/rating";
import type { ActionResult } from "./status";

async function seasonWorkId(seasonId: string): Promise<string | null> {
  const s = await db.season.findUnique({
    where: { id: seasonId },
    select: { workId: true },
  });
  return s?.workId ?? null;
}

const starsSchema = z.number().min(0.5).max(5).nullable();

/** Note de saison (T3, D5) — indépendante de la note de série. */
export async function setSeasonRating(
  seasonId: string,
  stars: number | null,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = starsSchema.safeParse(stars);
  if (!parsed.success) return { error: "Note invalide." };
  const workId = await seasonWorkId(seasonId);
  if (!workId) return { error: "Saison introuvable." };

  const score = parsed.data === null ? null : starsToScore(parsed.data);
  await db.userSeason.upsert({
    where: { userId_seasonId: { userId: user.id, seasonId } },
    update: { rating: score },
    create: { userId: user.id, seasonId, rating: score },
  });

  revalidatePath(`/oeuvre/${workId}`);
  return { ok: true };
}

const reviewSchema = z.object({
  text: z.string().max(20000),
  spoiler: z.boolean().optional(),
});

/** Critique de saison (T3). */
export async function setSeasonReview(
  seasonId: string,
  input: { text: string; spoiler?: boolean },
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { error: "Critique invalide." };
  const workId = await seasonWorkId(seasonId);
  if (!workId) return { error: "Saison introuvable." };
  const text = parsed.data.text.trim();

  await db.userSeason.upsert({
    where: { userId_seasonId: { userId: user.id, seasonId } },
    update: {
      reviewText: text || null,
      reviewHasSpoiler: text ? !!parsed.data.spoiler : false,
    },
    create: {
      userId: user.id,
      seasonId,
      reviewText: text || null,
      reviewHasSpoiler: text ? !!parsed.data.spoiler : false,
    },
  });

  revalidatePath(`/oeuvre/${workId}`);
  return { ok: true };
}
