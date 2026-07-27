import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { WorkStatusState } from "@/generated/prisma/enums";
import { computeSeriesAutoState, computeTomesAutoState } from "./progress";

// Aides serveur partagées par les server actions du suivi (lot 1).
// À exécuter dans la même transaction que la mutation qui les déclenche.

type Tx = Prisma.TransactionClient;

// États posés manuellement par l'utilisateur : jamais écrasés par l'auto-statut.
const MANUAL_STATES = new Set<WorkStatusState>([
  "ON_HOLD",
  "DROPPED",
  "COMPLETED",
]);

/**
 * Applique un statut suggéré par la progression (T2), sans écraser un état
 * manuel (en pause, abandonné, terminé) ni rétrograder inutilement.
 */
export async function applyAutoState(
  tx: Tx,
  userId: string,
  workId: string,
  suggestion: WorkStatusState | null,
): Promise<void> {
  const uw = await tx.userWork.findUnique({
    where: { userId_workId: { userId, workId } },
    select: { state: true, startedAt: true },
  });

  if (uw?.state && MANUAL_STATES.has(uw.state)) return;

  // Ne rétrograde vers « aucun statut » que si l'on était en progression.
  if (
    suggestion === null &&
    uw?.state !== "IN_PROGRESS" &&
    uw?.state !== "CAUGHT_UP"
  ) {
    return;
  }

  const now = new Date();
  const startPatch =
    suggestion === "IN_PROGRESS" && !uw?.startedAt ? { startedAt: now } : {};

  await tx.userWork.upsert({
    where: { userId_workId: { userId, workId } },
    update: { state: suggestion, ...startPatch },
    create: { userId, workId, state: suggestion, ...startPatch },
  });
}

/** Recalcule le statut d'une série/animé d'après les épisodes vus (T2). */
export async function recomputeSeriesState(
  tx: Tx,
  userId: string,
  workId: string,
): Promise<void> {
  const total = await tx.episode.count({ where: { season: { workId } } });
  const watched = await tx.episodeWatch.count({
    where: { userId, episode: { season: { workId } } },
  });
  await applyAutoState(tx, userId, workId, computeSeriesAutoState(watched, total));
}

/** Recalcule le statut d'une série BD/manga d'après les tomes lus (L4). */
export async function recomputeTomesState(
  tx: Tx,
  userId: string,
  workId: string,
): Promise<void> {
  const total = await tx.tome.count({ where: { workId } });
  const read = await tx.tomeProgress.count({
    where: { userId, tome: { workId }, state: "READ" },
  });
  await applyAutoState(tx, userId, workId, computeTomesAutoState(read, total));
}

/** Recale le compteur de visionnages/lectures (F2) sur le nombre d'entrées. */
export async function recomputeViewings(
  tx: Tx,
  userId: string,
  workId: string,
): Promise<void> {
  const count = await tx.journalEntry.count({ where: { userId, workId } });
  await tx.userWork.upsert({
    where: { userId_workId: { userId, workId } },
    update: { rewatchCount: count },
    create: { userId, workId, rewatchCount: count },
  });
}
