import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ImportTarget, ImportRow } from "@/generated/prisma/client";
import type { ImportSource, WorkStatusState } from "@/generated/prisma/enums";
import { normalizeTitle, slugify } from "@/lib/text";
import { upsertPersonIds } from "@/lib/people";
import { parseTagInput } from "@/lib/tags";
import {
  recomputeSeriesState,
  recomputeTomesState,
  recomputeViewings,
} from "@/lib/tracking";
import { usesEpisodes, usesTomes } from "@/lib/media";
import type { ImportedEvent } from "./types";

type Tx = Prisma.TransactionClient;

export type TargetWithRows = ImportTarget & { rows: ImportRow[] };

export type ApplyOutcome = {
  workId: string | null;
  created: boolean;
  entriesCreated: number;
  /** Données existantes préservées plutôt qu'écrasées (signalées au rapport). */
  conflicts: string[];
};

/**
 * Applique une cible : l'œuvre, puis tout ce que l'utilisateur en a dit.
 *
 * Idempotent de bout en bout — les entrées de journal passent par un
 * `createMany({ skipDuplicates: true })` adossé à `@@unique([userId,
 * importKey])`, le reste par des `upsert`. Réappliquer ne duplique rien.
 *
 * À exécuter dans une transaction par cible : une cible en échec ne doit pas
 * annuler les autres.
 */
export async function applyTarget(
  tx: Tx,
  userId: string,
  source: ImportSource,
  target: TargetWithRows,
): Promise<ApplyOutcome> {
  const conflicts: string[] = [];

  if (target.resolution === "IGNORE" || target.resolution === null) {
    return { workId: null, created: false, entriesCreated: 0, conflicts };
  }

  const events = target.rows.map((r) => reviveEvent(r.payload));
  const extra = (target.extra ?? {}) as {
    seasons?: number[];
    volumes?: number[];
  };

  // 1. L'œuvre : rattachée, ou créée « à compléter » (I1, D31).
  let workId: string;
  let created = false;

  if (target.resolution === "LINK" && target.matchedWorkId) {
    const existing = await tx.work.findUnique({
      where: { id: target.matchedWorkId },
      select: { id: true },
    });
    if (!existing) throw new Error("Fiche à rattacher introuvable.");
    workId = existing.id;
  } else {
    const work = await tx.work.create({
      data: {
        type: target.type,
        titleFr: target.titleFr,
        titleOriginal: target.titleOriginal,
        titleNormalized: normalizeTitle(target.titleFr),
        year: target.year,
        coverImageId: null,
        needsCompletion: true,
        createdById: userId,
        // Trace de provenance : utile pour comprendre d'où sort une fiche,
        // sans faire du catalogue un annuaire d'identifiants tiers (D6).
        metadata: {
          import: {
            source,
            externalId: target.externalId,
            batchId: target.batchId,
          },
        },
      },
      select: { id: true },
    });
    workId = work.id;
    created = true;

    // Créateurs : upsert par nom normalisé, comme à la création manuelle.
    for (const personId of await upsertPersonIds(tx, target.creators)) {
      await tx.workCreator.createMany({
        data: [{ workId, personId, role: null }],
        skipDuplicates: true,
      });
    }
  }

  // 2. Sous-unités rencontrées à l'import (saisons Serializd, tomes Goodreads).
  const seasonIds = new Map<number, string>();
  if (usesEpisodes(target.type)) {
    for (const number of extra.seasons ?? []) {
      const season = await tx.season.upsert({
        where: { workId_number: { workId, number } },
        update: {},
        create: { workId, number },
        select: { id: true },
      });
      seasonIds.set(number, season.id);
    }
  }

  const tomeIds = new Map<number, string>();
  if (usesTomes(target.type)) {
    for (const number of extra.volumes ?? []) {
      const tome = await tx.tome.upsert({
        where: { workId_number: { workId, number } },
        update: {},
        create: { workId, number },
        select: { id: true },
      });
      tomeIds.set(number, tome.id);
    }
  }

  // 3. Ma relation à l'œuvre : un seul upsert pour tous les événements.
  await applyUserWork(tx, userId, workId, events, conflicts);

  // 4. Journal : une seule écriture, c'est le point d'idempotence (I6).
  const logs = target.rows.filter((r) => r.kind === "LOG");
  let entriesCreated = 0;

  if (logs.length > 0) {
    const result = await tx.journalEntry.createMany({
      data: logs.map((row) => {
        const e = reviveEvent(row.payload);
        return {
          userId,
          workId,
          seasonId: e.work.seasonNumber
            ? (seasonIds.get(e.work.seasonNumber) ?? null)
            : null,
          tomeId: e.work.volumeNumber
            ? (tomeIds.get(e.work.volumeNumber) ?? null)
            : null,
          loggedAt: e.loggedAt,
          datePrecision: e.datePrecision,
          rating: e.rating,
          reviewText: e.reviewText,
          reviewHasSpoiler: e.reviewHasSpoiler,
          isRewatch: e.isRewatch,
          context: e.context,
          importKey: row.importKey,
        };
      }),
      skipDuplicates: true,
    });
    entriesCreated = result.count;
  }

  // 5. Note et critique de saison (T3, D5).
  for (const event of events) {
    const number = event.work.seasonNumber;
    const seasonId = number ? seasonIds.get(number) : undefined;
    if (!seasonId) continue;
    if (event.rating === null && !event.reviewText) continue;

    await tx.userSeason.upsert({
      where: { userId_seasonId: { userId, seasonId } },
      update: {
        rating: event.rating ?? undefined,
        reviewText: event.reviewText ?? undefined,
        reviewHasSpoiler: event.reviewHasSpoiler,
      },
      create: {
        userId,
        seasonId,
        rating: event.rating,
        reviewText: event.reviewText,
        reviewHasSpoiler: event.reviewHasSpoiler,
      },
    });
  }

  // 6. Tomes lus (L4).
  const readTomes = events
    .filter((e) => e.kind === "LOG" && e.work.volumeNumber !== null)
    .map((e) => tomeIds.get(e.work.volumeNumber!))
    .filter((id): id is string => Boolean(id));

  if (readTomes.length > 0) {
    await tx.tomeProgress.createMany({
      data: [...new Set(readTomes)].map((tomeId) => ({
        userId,
        tomeId,
        state: "READ" as const,
      })),
      skipDuplicates: true,
    });
  }

  // 7. Étiquettes du journal (lot 3, S10).
  //
  //    Le `createMany` ci-dessus ne rend pas les identifiants : on relit les
  //    entrées **par leur clé d'import**. C'est aussi ce qui fait qu'un rejeu
  //    rattache les étiquettes à des entrées créées au premier passage.
  await applyJournalTags(tx, userId, workId, logs);

  // 8. Appartenance aux listes (lot 3, S9).
  await applyListItems(tx, userId, workId, target.rows);

  // 9. Caches : une fois par cible, jamais par ligne.
  await recomputeViewings(tx, userId, workId);
  if (usesTomes(target.type) && tomeIds.size > 0) {
    await recomputeTomesState(tx, userId, workId);
  }
  // Séries : sans épisodes créés (Serializd n'en fournit pas), le recalcul
  // n'aurait rien à dire — on ne dépense pas deux requêtes pour rien.
  if (usesEpisodes(target.type)) {
    const hasEpisodes = await tx.episode.count({
      where: { season: { workId } },
    });
    if (hasEpisodes > 0) await recomputeSeriesState(tx, userId, workId);
  }

  return { workId, created, entriesCreated, conflicts };
}

/**
 * Pose les étiquettes portées par les entrées importées (S10).
 *
 * Idempotent : les `Tag` passent par un upsert sur `(userId, slug)`, les
 * liaisons par un `createMany({ skipDuplicates: true })` adossé à la clé
 * composée `@@id([tagId, entryId])`.
 */
async function applyJournalTags(
  tx: Tx,
  userId: string,
  workId: string,
  logs: ImportRow[],
): Promise<void> {
  const tagged = logs
    .map((row) => ({ row, event: reviveEvent(row.payload) }))
    .filter(({ event }) => event.tags.length > 0);
  if (tagged.length === 0) return;

  // Une seule relecture pour toute la cible.
  const entries = await tx.journalEntry.findMany({
    where: {
      userId,
      workId,
      importKey: { in: tagged.map(({ row }) => row.importKey) },
    },
    select: { id: true, importKey: true },
  });
  const byKey = new Map(entries.map((e) => [e.importKey, e.id]));

  // Les tags distincts d'abord : un upsert par étiquette, pas par ligne.
  const wanted = new Map<string, string>();
  for (const { event } of tagged) {
    for (const parsed of parseTagInput(event.tags.join(", "))) {
      if (!wanted.has(parsed.slug)) wanted.set(parsed.slug, parsed.name);
    }
  }

  const tagIds = new Map<string, string>();
  for (const [slug, name] of wanted) {
    const tag = await tx.tag.upsert({
      where: { userId_slug: { userId, slug } },
      update: {},
      create: { userId, name, slug },
      select: { id: true },
    });
    tagIds.set(slug, tag.id);
  }

  const links: { entryId: string; tagId: string }[] = [];
  for (const { row, event } of tagged) {
    const entryId = byKey.get(row.importKey);
    if (!entryId) continue;
    for (const parsed of parseTagInput(event.tags.join(", "))) {
      const tagId = tagIds.get(parsed.slug);
      if (tagId) links.push({ entryId, tagId });
    }
  }

  if (links.length > 0) {
    await tx.journalEntryTag.createMany({ data: links, skipDuplicates: true });
  }
}

/**
 * Range l'œuvre dans les listes importées (S9).
 *
 * La liste est créée **paresseusement, au premier élément appliqué** : rien ne
 * doit être écrit dans le suivi avant l'application, c'est ce que l'écran
 * d'analyse promet à l'utilisateur.
 *
 * L'`update: {}` de l'upsert est délibéré — un rejeu ne doit pas réécrire le
 * titre d'une liste que l'utilisateur a renommée depuis.
 */
async function applyListItems(
  tx: Tx,
  userId: string,
  workId: string,
  rows: ImportRow[],
): Promise<void> {
  for (const row of rows) {
    if (row.kind !== "LIST_ITEM") continue;
    const event = reviveEvent(row.payload);
    if (!event.list) continue;

    const list = await tx.list.upsert({
      where: { userId_importKey: { userId, importKey: event.list.key } },
      update: {},
      create: {
        userId,
        title: event.list.name,
        slug: await uniqueListSlug(tx, userId, event.list.name),
        description: event.list.description,
        isRanked: event.list.isRanked,
        importKey: event.list.key,
        ...(event.list.createdAt ? { createdAt: event.list.createdAt } : {}),
      },
      select: { id: true },
    });

    await tx.listItem.createMany({
      data: [
        {
          listId: list.id,
          workId,
          // Letterboxd numérote à partir de 1, nos positions à partir de 0.
          position: event.list.position != null ? event.list.position - 1 : 0,
          note: event.list.note,
        },
      ],
      skipDuplicates: true,
    });
  }
}

/** Slug libre pour un utilisateur : `ma-liste`, puis `ma-liste-2`… */
async function uniqueListSlug(
  tx: Tx,
  userId: string,
  title: string,
): Promise<string> {
  const base = slugify(title) || "liste";
  const taken = await tx.list.findMany({
    where: { userId, slug: { startsWith: base } },
    select: { slug: true },
  });
  const used = new Set(taken.map((l) => l.slug));

  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * Fusionne les événements en une seule ligne UserWork.
 *
 * Règle de prudence : sur une fiche déjà suivie, l'import ne détruit rien.
 * Une note ou une critique déjà saisie est conservée et le conflit est
 * signalé ; un état posé à la main (en pause, abandonné, terminé) est
 * respecté, comme partout ailleurs dans l'application.
 */
async function applyUserWork(
  tx: Tx,
  userId: string,
  workId: string,
  events: ImportedEvent[],
  conflicts: string[],
): Promise<void> {
  const existing = await tx.userWork.findUnique({
    where: { userId_workId: { userId, workId } },
  });

  const rated = latest(events.filter((e) => e.rating !== null));
  const reviewed = latest(events.filter((e) => e.reviewText));
  const liked = events.some((e) => e.liked);
  const watchlisted = events.find((e) => e.watchlistedAt !== null);
  const stated = events.find((e) => e.state !== null);
  const started = events.find((e) => e.startedAt !== null);
  const finished = events.find((e) => e.finishedAt !== null);

  // Valeurs simples (pas d'opérateurs Prisma) : le même objet sert à la
  // création et à la mise à jour de l'upsert.
  const data: {
    currentRating?: number;
    reviewText?: string;
    reviewHasSpoiler?: boolean;
    reviewedAt?: Date;
    liked?: boolean;
    watchlistedAt?: Date;
    startedAt?: Date;
    finishedAt?: Date;
    state?: WorkStatusState;
  } = {};

  if (rated?.rating != null) {
    if (
      existing?.currentRating != null &&
      existing.currentRating !== rated.rating
    ) {
      conflicts.push("note déjà saisie conservée");
    } else {
      data.currentRating = rated.rating;
    }
  }

  if (reviewed?.reviewText) {
    if (existing?.reviewText) {
      conflicts.push("critique déjà saisie conservée");
    } else {
      data.reviewText = reviewed.reviewText;
      data.reviewHasSpoiler = reviewed.reviewHasSpoiler;
      data.reviewedAt = reviewed.loggedAt ?? new Date();
    }
  }

  if (liked) data.liked = true;
  if (watchlisted?.watchlistedAt && !existing?.watchlistedAt) {
    data.watchlistedAt = watchlisted.watchlistedAt;
  }
  if (started?.startedAt && !existing?.startedAt)
    data.startedAt = started.startedAt;
  if (finished?.finishedAt && !existing?.finishedAt) {
    data.finishedAt = finished.finishedAt;
  }

  // L'état importé ne remplace jamais un état déjà posé à la main.
  const imported = resolveState(events, stated?.state ?? null);
  if (imported && !existing?.state) {
    data.state = imported;
  } else if (imported && existing?.state && existing.state !== imported) {
    conflicts.push("statut existant conservé");
  }

  await tx.userWork.upsert({
    where: { userId_workId: { userId, workId } },
    update: data,
    create: { userId, workId, ...data },
  });
}

/**
 * Un film consigné dans le journal est vu : la présence d'une consommation
 * l'emporte sur une simple envie (une œuvre à la fois vue et en liste d'envies
 * ne redevient pas « à voir »).
 */
function resolveState(
  events: ImportedEvent[],
  declared: WorkStatusState | null,
): WorkStatusState | null {
  const hasLog = events.some((e) => e.kind === "LOG");
  if (hasLog && (declared === null || declared === "WANT")) return "COMPLETED";
  return declared;
}

/** L'événement daté le plus récent, à défaut le premier rencontré. */
function latest(events: ImportedEvent[]): ImportedEvent | undefined {
  if (events.length === 0) return undefined;
  return [...events].sort((a, b) => {
    const ta = a.loggedAt ? new Date(a.loggedAt).getTime() : -Infinity;
    const tb = b.loggedAt ? new Date(b.loggedAt).getTime() : -Infinity;
    return tb - ta;
  })[0];
}

/** Le JSON stocké redonne des chaînes : on rétablit les dates. */
function reviveEvent(payload: Prisma.JsonValue): ImportedEvent {
  const e = payload as unknown as ImportedEvent;
  return {
    ...e,
    loggedAt: e.loggedAt ? new Date(e.loggedAt) : null,
    watchlistedAt: e.watchlistedAt ? new Date(e.watchlistedAt) : null,
    startedAt: e.startedAt ? new Date(e.startedAt) : null,
    finishedAt: e.finishedAt ? new Date(e.finishedAt) : null,
    // Les lots analysés avant le lot 3 n'ont ni l'un ni l'autre : on les
    // rétablit plutôt que de laisser `undefined` traverser le code.
    tags: e.tags ?? [],
    list: e.list
      ? {
          ...e.list,
          createdAt: e.list.createdAt ? new Date(e.list.createdAt) : null,
        }
      : null,
  };
}
