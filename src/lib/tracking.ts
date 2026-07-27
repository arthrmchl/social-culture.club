import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { WorkStatusState } from "@/generated/prisma/enums";
import { computeSeriesAutoState, computeTomesAutoState } from "./progress";
import { coveredTomeNumbers } from "./editions";

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
  await applyAutoState(
    tx,
    userId,
    workId,
    computeSeriesAutoState(watched, total),
  );
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

/**
 * Lire une intégrale marque comme lus les tomes qu'elle couvre (L6, D8).
 *
 * Seuls des `TomeProgress` sont écrits, jamais une entrée de journal par
 * tome : le journal garde la seule entrée de l'intégrale, sans quoi
 * `recomputeViewings` compterait cinq lectures pour une.
 *
 * Idempotent — `createMany({ skipDuplicates: true })` adossé à
 * `@@unique([userId, tomeId])`, comme le reste du suivi au tome.
 *
 * Renvoie le nombre de tomes concernés (0 si l'édition n'est pas une
 * intégrale, ou si elle ne relève pas de cette œuvre).
 */
export async function applyEditionCoverage(
  tx: Tx,
  userId: string,
  workId: string,
  editionId: string,
): Promise<number> {
  const edition = await tx.edition.findUnique({
    where: { id: editionId },
    select: {
      workId: true,
      tome: { select: { workId: true } },
      coversTomeFrom: true,
      coversTomeTo: true,
    },
  });
  if (!edition) return 0;

  // Garde d'appartenance : une édition rattachée à une autre œuvre ne doit
  // rien pouvoir marquer ici, même si son identifiant est passé à la main.
  const owner = edition.workId ?? edition.tome?.workId ?? null;
  if (owner !== workId) return 0;

  const numbers = coveredTomeNumbers(edition);
  if (numbers.length === 0) return 0;

  const tomes = await tx.tome.findMany({
    where: { workId, number: { in: numbers } },
    select: { id: true },
  });
  if (tomes.length === 0) return 0;

  await tx.tomeProgress.createMany({
    data: tomes.map((t) => ({ userId, tomeId: t.id, state: "READ" as const })),
    skipDuplicates: true,
  });

  await recomputeTomesState(tx, userId, workId);
  return tomes.length;
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
