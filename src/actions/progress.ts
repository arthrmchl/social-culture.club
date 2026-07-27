"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { episodesUpTo, parseEpisodeCode } from "@/lib/progress";
import { recomputeSeriesState, recomputeTomesState } from "@/lib/tracking";
import type { TomeState } from "@/generated/prisma/enums";
import type { ActionResult } from "./status";

function revalidateWork(workId: string) {
  revalidatePath(`/oeuvre/${workId}`);
  revalidatePath("/");
  revalidatePath("/journal");
}

const dateSchema = z.string().datetime().nullable().optional();

/** Coche/décoche un épisode (T1). Chaque coche porte une date (défaut : maintenant). */
export async function setEpisodeWatched(
  episodeId: string,
  watched: boolean,
  watchedAt?: string | null,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsedDate = dateSchema.safeParse(watchedAt);
  if (!parsedDate.success) return { error: "Date invalide." };

  const ep = await db.episode.findUnique({
    where: { id: episodeId },
    select: { season: { select: { workId: true } } },
  });
  if (!ep) return { error: "Épisode introuvable." };
  const workId = ep.season.workId;

  await db.$transaction(async (tx) => {
    if (watched) {
      const when =
        watchedAt === null
          ? null
          : watchedAt
            ? new Date(watchedAt)
            : new Date();
      await tx.episodeWatch.upsert({
        where: { userId_episodeId: { userId: user.id, episodeId } },
        update: { watchedAt: when },
        create: { userId: user.id, episodeId, watchedAt: when },
      });
    } else {
      await tx.episodeWatch.deleteMany({
        where: { userId: user.id, episodeId },
      });
    }
    await recomputeSeriesState(tx, user.id, workId);
  });

  revalidateWork(workId);
  return { ok: true };
}

/**
 * Marque (ou démarque) toute une saison (T4). En marquage, crée une entrée de
 * journal synthétique plutôt qu'une ligne par épisode.
 */
export async function markSeasonWatched(
  seasonId: string,
  watched: boolean,
  watchedAt?: string | null,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsedDate = dateSchema.safeParse(watchedAt);
  if (!parsedDate.success) return { error: "Date invalide." };

  const season = await db.season.findUnique({
    where: { id: seasonId },
    select: { workId: true, number: true, episodes: { select: { id: true } } },
  });
  if (!season) return { error: "Saison introuvable." };
  const { workId } = season;
  const episodeIds = season.episodes.map((e) => e.id);

  await db.$transaction(async (tx) => {
    if (watched && episodeIds.length > 0) {
      const when =
        watchedAt === null ? null : watchedAt ? new Date(watchedAt) : new Date();

      const entry = await tx.journalEntry.create({
        data: {
          userId: user.id,
          workId,
          seasonId,
          loggedAt: watchedAt === null ? null : when,
          datePrecision: watchedAt === null ? "UNKNOWN" : "DAY",
          isSeasonBatch: true,
        },
      });

      for (const episodeId of episodeIds) {
        await tx.episodeWatch.upsert({
          where: { userId_episodeId: { userId: user.id, episodeId } },
          update: { watchedAt: when, journalEntryId: entry.id },
          create: {
            userId: user.id,
            episodeId,
            watchedAt: when,
            journalEntryId: entry.id,
          },
        });
      }
    } else if (!watched) {
      await tx.episodeWatch.deleteMany({
        where: { userId: user.id, episodeId: { in: episodeIds } },
      });
      // Retire les entrées synthétiques de cette saison.
      await tx.journalEntry.deleteMany({
        where: { userId: user.id, seasonId, isSeasonBatch: true },
      });
    }
    await recomputeSeriesState(tx, user.id, workId);
  });

  revalidateWork(workId);
  return { ok: true };
}

/** « Marquer comme vu jusqu'à SxxEyy » (T1). */
export async function markUpTo(
  workId: string,
  code: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const target = parseEpisodeCode(code);
  if (!target) return { error: "Code d'épisode illisible (ex. S03E07)." };

  const episodes = await db.episode.findMany({
    where: { season: { workId } },
    select: { id: true, number: true, season: { select: { number: true } } },
  });
  const refs = episodes.map((e) => ({
    id: e.id,
    seasonNumber: e.season.number,
    episodeNumber: e.number,
  }));
  const targetIds = episodesUpTo(refs, target);
  if (targetIds.length === 0) return { error: "Aucun épisode jusqu'à cette cible." };

  await db.$transaction(async (tx) => {
    const already = await tx.episodeWatch.findMany({
      where: { userId: user.id, episodeId: { in: targetIds } },
      select: { episodeId: true },
    });
    const seen = new Set(already.map((w) => w.episodeId));
    const toAdd = targetIds.filter((id) => !seen.has(id));

    if (toAdd.length > 0) {
      const now = new Date();
      const entry = await tx.journalEntry.create({
        data: {
          userId: user.id,
          workId,
          loggedAt: now,
          datePrecision: "DAY",
          isSeasonBatch: true,
        },
      });
      for (const episodeId of toAdd) {
        await tx.episodeWatch.create({
          data: {
            userId: user.id,
            episodeId,
            watchedAt: now,
            journalEntryId: entry.id,
          },
        });
      }
    }
    await recomputeSeriesState(tx, user.id, workId);
  });

  revalidateWork(workId);
  return { ok: true };
}

const tomeStateSchema = z.enum(["READING", "READ"]).nullable();

/** Suivi au tome (L4) : à lire (null) → en cours → lu. */
export async function setTomeState(
  tomeId: string,
  state: TomeState | null,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = tomeStateSchema.safeParse(state);
  if (!parsed.success) return { error: "État de tome invalide." };

  const tome = await db.tome.findUnique({
    where: { id: tomeId },
    select: { workId: true },
  });
  if (!tome) return { error: "Tome introuvable." };
  const { workId } = tome;

  await db.$transaction(async (tx) => {
    if (parsed.data === null) {
      await tx.tomeProgress.deleteMany({ where: { userId: user.id, tomeId } });
    } else {
      await tx.tomeProgress.upsert({
        where: { userId_tomeId: { userId: user.id, tomeId } },
        update: { state: parsed.data },
        create: { userId: user.id, tomeId, state: parsed.data },
      });
    }
    await recomputeTomesState(tx, user.id, workId);
  });

  revalidateWork(workId);
  return { ok: true };
}
