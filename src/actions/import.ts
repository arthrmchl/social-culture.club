"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import type { ActionResult } from "@/actions/status";
import { adapterFor } from "@/lib/import/adapters";
import { groupIntoTargets } from "@/lib/import/merge";
import { findImportCandidates } from "@/lib/import/candidates";
import { decideResolution } from "@/lib/import/match";
import { applyTarget } from "@/lib/import/apply";
import { MAX_ROWS } from "@/lib/import/limits";
import {
  DEFAULT_IMPORT_OPTIONS,
  type ImportOptions,
  type ImportWarning,
} from "@/lib/import/types";
import type { ImportResolution, WorkType } from "@/generated/prisma/enums";
import { isWorkType } from "@/lib/media";

const idSchema = z.string().min(1);

const optionsSchema = z
  .object({
    watchedDateFallback: z.enum(["unknown", "addedDate"]),
    importWatchlist: z.boolean(),
    importLikes: z.boolean(),
    importReviews: z.boolean(),
    detectVolumes: z.boolean(),
    seriesDefaultType: z.enum(["SERIES", "ANIME"]),
    retainLists: z.boolean(),
  })
  .partial();

/** Le lot demandé, à condition qu'il appartienne bien à l'utilisateur. */
async function ownedBatch(batchId: string) {
  const user = await requireUser();
  const parsed = idSchema.safeParse(batchId);
  if (!parsed.success) return { ok: false as const, error: "Lot invalide." };

  const batch = await db.importBatch.findUnique({
    where: { id: parsed.data },
    include: { files: true },
  });
  if (!batch || batch.userId !== user.id) {
    return { ok: false as const, error: "Lot d'import introuvable." };
  }
  return { ok: true as const, user, batch };
}

/**
 * Analyse un lot : lit les fichiers, produit les événements, les regroupe en
 * cibles, cherche les candidats du catalogue et pré-décide ce qui est évident
 * (I6). Rejouable — une nouvelle analyse remplace la précédente tant que le
 * lot n'a pas été appliqué.
 */
export async function analyzeImportBatch(
  batchId: string,
  options?: Partial<ImportOptions>,
): Promise<ActionResult> {
  const owned = await ownedBatch(batchId);
  if (!owned.ok) return { error: owned.error };
  const { batch } = owned;

  if (batch.status === "APPLYING") {
    return { error: "Application en cours : impossible de relancer l'analyse." };
  }
  if (batch.status === "APPLIED") {
    return { error: "Ce lot a déjà été appliqué." };
  }

  const adapter = adapterFor(batch.source);
  if (!adapter) return { error: "Source d'import non prise en charge." };

  const parsedOptions = optionsSchema.safeParse(options ?? {});
  if (!parsedOptions.success) return { error: "Options d'analyse invalides." };

  const merged: ImportOptions = {
    ...DEFAULT_IMPORT_OPTIONS,
    ...(batch.options as Partial<ImportOptions>),
    ...parsedOptions.data,
  };

  // 1. Analyse (pure) des fichiers.
  const files = batch.files.map((f) => ({ name: f.name, content: f.content }));
  const result = adapter.parse(files, merged);
  const warnings: ImportWarning[] = [...result.warnings];

  if (result.events.length > MAX_ROWS) {
    return {
      error: `Ce lot contient ${result.events.length} lignes, au-delà de la limite de ${MAX_ROWS}. Découpez l'export en plusieurs fichiers.`,
    };
  }

  const targets = groupIntoTargets(batch.source, result.events);

  // 2. Rapprochement avec le catalogue existant (une requête par paquet).
  const candidatesByKey = await findImportCandidates(
    targets.map((t) => ({
      key: t.workKey,
      titleNormalized: t.titleNormalized,
      year: t.ref.year,
      type: t.ref.type,
    })),
  );

  // 3. Pré-décision : ce qui est évident ne doit pas remonter à l'utilisateur.
  const decisions = new Map(
    targets.map((t) => [
      t.workKey,
      decideResolution(t.ref, candidatesByKey.get(t.workKey) ?? []),
    ]),
  );

  // 4. Écriture : on remplace intégralement l'analyse précédente.
  const retained = new Set(result.retained.map((f) => f.name));

  await db.$transaction(
    async (tx) => {
      await tx.importRow.deleteMany({ where: { batchId: batch.id } });
      await tx.importTarget.deleteMany({ where: { batchId: batch.id } });

      for (const target of targets) {
        const candidates = candidatesByKey.get(target.workKey) ?? [];
        const decision = decisions.get(target.workKey)!;

        const created = await tx.importTarget.create({
          data: {
            batchId: batch.id,
            workKey: target.workKey,
            externalId: target.ref.externalId,
            type: target.ref.type,
            titleFr: target.ref.titleFr,
            titleOriginal: target.ref.titleOriginal,
            titleNormalized: target.titleNormalized,
            year: target.ref.year,
            isbn: target.ref.isbn,
            pageCount: target.ref.pageCount,
            creators: target.ref.creators,
            extra: { seasons: target.seasons, volumes: target.volumes },
            candidates,
            resolution: decision.resolution,
            decidedBy: decision.auto ? "AUTO" : null,
            confidence: decision.confidence,
            matchedWorkId: decision.workId,
          },
          select: { id: true },
        });

        await tx.importRow.createMany({
          data: target.events.map(({ event, importKey }) => ({
            batchId: batch.id,
            targetId: created.id,
            kind: event.kind,
            sourceFile: event.sourceFile,
            sourceLine: event.sourceLine,
            raw: {},
            payload: JSON.parse(JSON.stringify(event)),
            importKey,
          })),
        });
      }

      await tx.importFile.updateMany({
        where: { batchId: batch.id },
        data: { parsed: true },
      });
      if (retained.size > 0) {
        await tx.importFile.updateMany({
          where: { batchId: batch.id, name: { in: [...retained] } },
          data: { parsed: false },
        });
      }

      await tx.importBatch.update({
        where: { id: batch.id },
        data: {
          status: "ANALYZED",
          analyzedAt: new Date(),
          options: merged,
          warnings: JSON.parse(JSON.stringify(warnings)),
          cursor: 0,
          error: null,
          stats: {
            events: result.events.length,
            targets: targets.length,
            autoLink: [...decisions.values()].filter(
              (d) => d.auto && d.resolution === "LINK",
            ).length,
            autoCreate: [...decisions.values()].filter(
              (d) => d.auto && d.resolution === "CREATE",
            ).length,
            pending: [...decisions.values()].filter((d) => !d.auto).length,
          },
        },
      });
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  revalidatePath(`/import/${batch.id}`);
  revalidatePath("/import");
  return { ok: true };
}

/** Décision manuelle sur une cible (I6). */
export async function setTargetResolution(
  targetId: string,
  resolution: ImportResolution,
  workId?: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const target = await db.importTarget.findUnique({
    where: { id: targetId },
    include: { batch: { select: { id: true, userId: true, status: true } } },
  });
  if (!target || target.batch.userId !== user.id) {
    return { error: "Cible introuvable." };
  }
  if (target.batch.status === "APPLYING" || target.batch.status === "APPLIED") {
    return { error: "Ce lot n'est plus modifiable." };
  }
  if (target.appliedAt) return { error: "Cette cible a déjà été appliquée." };

  if (resolution === "LINK") {
    if (!workId) return { error: "Sélectionnez la fiche à rattacher." };
    const work = await db.work.findUnique({
      where: { id: workId },
      select: { id: true },
    });
    if (!work) return { error: "Fiche à rattacher introuvable." };
  }

  await db.importTarget.update({
    where: { id: target.id },
    data: {
      resolution,
      decidedBy: "USER",
      matchedWorkId: resolution === "LINK" ? (workId ?? null) : null,
    },
  });

  revalidatePath(`/import/${target.batch.id}/rapprochement`);
  return { ok: true };
}

/** Change le type de média d'une cible avant création (S2). */
export async function setTargetType(
  targetId: string,
  type: WorkType,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isWorkType(type)) return { error: "Type de média invalide." };

  const target = await db.importTarget.findUnique({
    where: { id: targetId },
    include: { batch: { select: { id: true, userId: true, status: true } } },
  });
  if (!target || target.batch.userId !== user.id) {
    return { error: "Cible introuvable." };
  }
  if (target.batch.status === "APPLYING" || target.batch.status === "APPLIED") {
    return { error: "Ce lot n'est plus modifiable." };
  }

  await db.importTarget.update({ where: { id: target.id }, data: { type } });

  revalidatePath(`/import/${target.batch.id}/rapprochement`);
  return { ok: true };
}

/** Décision groupée sur toutes les cibles encore à décider. */
export async function bulkResolve(
  batchId: string,
  filter: "pending" | "unmatched",
  resolution: ImportResolution,
): Promise<ActionResult> {
  const owned = await ownedBatch(batchId);
  if (!owned.ok) return { error: owned.error };
  const { batch } = owned;

  if (batch.status === "APPLYING" || batch.status === "APPLIED") {
    return { error: "Ce lot n'est plus modifiable." };
  }
  if (resolution === "LINK") {
    return { error: "Un rattachement se décide fiche par fiche." };
  }

  // « À décider » = proposé par l'analyse mais non tranché (decidedBy null).
  await db.importTarget.updateMany({
    where: {
      batchId: batch.id,
      appliedAt: null,
      ...(filter === "pending" ? { decidedBy: null } : { matchedWorkId: null }),
    },
    data: { resolution, decidedBy: "USER", matchedWorkId: null },
  });

  revalidatePath(`/import/${batch.id}/rapprochement`);
  return { ok: true };
}

/** Cibles traitées par appel — l'UI boucle jusqu'à épuisement. */
const CHUNK_SIZE = 25;
/** Un verrou plus vieux que cela est considéré comme abandonné. */
const LOCK_TTL_MS = 5 * 60 * 1000;

export type ApplyProgress =
  | { ok: true; processed: number; total: number; done: boolean }
  | { error: string };

/**
 * Applique un paquet de cibles (I6).
 *
 * Par paquets et non d'un bloc : une transaction unique sur des milliers de
 * lignes tiendrait la base trop longtemps et ne se reprendrait pas. Une
 * transaction par cible — une œuvre n'est jamais créée à moitié, et une cible
 * en échec n'annule pas les autres.
 */
export async function applyImportChunk(batchId: string): Promise<ApplyProgress> {
  const owned = await ownedBatch(batchId);
  if (!owned.ok) return { error: owned.error };
  const { user, batch } = owned;

  if (batch.status === "APPLIED") return { error: "Ce lot a déjà été appliqué." };
  if (batch.status !== "ANALYZED" && batch.status !== "APPLYING") {
    return { error: "Ce lot doit d'abord être analysé." };
  }

  // Verrou : empêche deux onglets (ou un double-clic) d'appliquer en parallèle.
  const lockedRecently =
    batch.lockedAt && Date.now() - batch.lockedAt.getTime() < LOCK_TTL_MS;
  if (batch.status === "APPLYING" && lockedRecently) {
    return { error: "Application déjà en cours." };
  }

  await db.importBatch.update({
    where: { id: batch.id },
    data: { status: "APPLYING", lockedAt: new Date(), error: null },
  });

  const where = {
    batchId: batch.id,
    appliedAt: null,
    resolution: { in: ["LINK", "CREATE"] as ImportResolution[] },
  };

  const total = await db.importTarget.count({
    where: { batchId: batch.id, resolution: { in: ["LINK", "CREATE"] as ImportResolution[] } },
  });

  const targets = await db.importTarget.findMany({
    where,
    orderBy: { titleNormalized: "asc" },
    take: CHUNK_SIZE,
    include: { rows: true },
  });

  let processed = 0;

  for (const target of targets) {
    try {
      await db.$transaction(
        async (tx) => {
          const outcome = await applyTarget(tx, user.id, batch.source, target);

          // `error` est réservé aux vrais échecs ; ce qui a été volontairement
          // conservé et le nombre d'entrées réellement créées vivent dans
          // `extra`, sinon le rapport confond « préservé » et « en échec ».
          await tx.importTarget.update({
            where: { id: target.id },
            data: {
              appliedAt: new Date(),
              error: null,
              extra: {
                ...((target.extra ?? {}) as object),
                conflicts: outcome.conflicts,
                entriesCreated: outcome.entriesCreated,
              },
            },
          });
          await tx.importRow.updateMany({
            where: { targetId: target.id },
            data: { status: "APPLIED" },
          });
          await tx.importBatch.update({
            where: { id: batch.id },
            data: { cursor: { increment: 1 }, lockedAt: new Date() },
          });
        },
        // Le défaut de 5 s ne suffit pas pour une œuvre à cinquante entrées.
        { timeout: 30_000, maxWait: 5_000 },
      );
      processed += 1;
    } catch (e) {
      // Une cible en échec est mise de côté : l'import continue.
      const message = e instanceof Error ? e.message : "Échec inconnu.";
      await db.importTarget.update({
        where: { id: target.id },
        data: { appliedAt: new Date(), error: message },
      });
      await db.importRow.updateMany({
        where: { targetId: target.id },
        data: { status: "FAILED", error: message },
      });
      processed += 1;
    }
  }

  const remaining = await db.importTarget.count({ where });

  if (remaining === 0) {
    await finalizeImportBatch(batch.id);
    return { ok: true, processed, total, done: true };
  }

  await db.importBatch.update({
    where: { id: batch.id },
    data: { lockedAt: new Date() },
  });
  return { ok: true, processed, total, done: false };
}

/** Clôt le lot : compteurs figés, caches de pages rafraîchis. */
async function finalizeImportBatch(batchId: string): Promise<void> {
  const [applied, created, entriesRows, failed, ignored] = await Promise.all([
    db.importTarget.count({
      where: { batchId, appliedAt: { not: null }, error: null },
    }),
    db.importTarget.count({
      where: { batchId, resolution: "CREATE", appliedAt: { not: null } },
    }),
    // Entrées réellement créées — un ré-import en crée zéro, et le rapport
    // doit le dire.
    db.$queryRaw<{ total: bigint | null }[]>`
      SELECT SUM((extra->>'entriesCreated')::bigint) AS total
      FROM "ImportTarget"
      WHERE "batchId" = ${batchId}
    `,
    db.importTarget.count({ where: { batchId, error: { not: null } } }),
    db.importTarget.count({ where: { batchId, resolution: "IGNORE" } }),
  ]);

  const entries = Number(entriesRows[0]?.total ?? 0);

  const batch = await db.importBatch.findUnique({
    where: { id: batchId },
    select: { stats: true },
  });

  await db.importBatch.update({
    where: { id: batchId },
    data: {
      status: "APPLIED",
      appliedAt: new Date(),
      lockedAt: null,
      stats: {
        ...((batch?.stats ?? {}) as object),
        applied,
        created,
        entries,
        failed,
        ignored,
      },
    },
  });

  // Une seule fois, en fin de course — surtout pas à chaque paquet.
  for (const path of ["/", "/journal", "/watchlist", "/catalogue", "/a-completer"]) {
    revalidatePath(path);
  }
  revalidatePath(`/import/${batchId}`);
}

/** Abandonne un lot sans le supprimer (garde la trace des fichiers). */
export async function cancelImportBatch(batchId: string): Promise<ActionResult> {
  const owned = await ownedBatch(batchId);
  if (!owned.ok) return { error: owned.error };
  if (owned.batch.status === "APPLIED") {
    return { error: "Un lot appliqué ne peut plus être annulé." };
  }

  await db.importBatch.update({
    where: { id: owned.batch.id },
    data: { status: "CANCELLED" },
  });

  revalidatePath("/import");
  return { ok: true };
}

/** Supprime un lot et tout ce qu'il contient (les œuvres créées restent). */
export async function deleteImportBatch(batchId: string): Promise<ActionResult> {
  const owned = await ownedBatch(batchId);
  if (!owned.ok) return { error: owned.error };
  if (owned.batch.status === "APPLYING") {
    return { error: "Application en cours : impossible de supprimer le lot." };
  }

  await db.importBatch.delete({ where: { id: owned.batch.id } });

  revalidatePath("/import");
  return { ok: true };
}
