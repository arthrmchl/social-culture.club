/**
 * Vérification de la couche données du lot 0 contre la vraie base :
 * création d'œuvres + sous-unités (générateurs), recherche floue (pg_trgm)
 * et détection de doublons — via les MÊMES requêtes SQL que src/lib/search.ts.
 * Usage : npx tsx scripts/verify.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { normalizeTitle } from "../src/lib/text";
import { buildSeasons, buildTomes } from "../src/lib/generators";
import { starsToScore } from "../src/lib/rating";
import { computeSeriesAutoState, computeTomesAutoState } from "../src/lib/progress";
import { letterboxdAdapter } from "../src/lib/import/adapters/letterboxd";
import { loadFixture } from "../src/lib/import/fixtures";
import { groupIntoTargets } from "../src/lib/import/merge";
import { findImportCandidates } from "../src/lib/import/candidates";
import { decideResolution } from "../src/lib/import/match";
import { applyTarget } from "../src/lib/import/apply";
import {
  DEFAULT_IMPORT_OPTIONS,
  type ImportedFile,
} from "../src/lib/import/types";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  const admin = await db.user.findFirst({ where: { role: "admin" } });
  if (!admin) throw new Error("Admin introuvable — lancer le seed d'abord.");

  const img = await db.image.create({
    data: { path: "covers/placeholder.webp", uploadedById: admin.id },
  });

  await db.work.deleteMany({
    where: { titleFr: { in: ["Le Voyage de Chihiro", "Frieren", "Berserk"] } },
  });

  const film = await db.work.create({
    data: {
      type: "FILM",
      titleFr: "Le Voyage de Chihiro",
      titleOriginal: "千と千尋の神隠し",
      titleNormalized: normalizeTitle("Le Voyage de Chihiro"),
      year: 2001,
      durationMinutes: 125,
      coverImageId: img.id,
      createdById: admin.id,
    },
  });

  const anime = await db.work.create({
    data: {
      type: "ANIME",
      titleFr: "Frieren",
      titleNormalized: normalizeTitle("Frieren"),
      year: 2023,
      metadata: { format: "TV" },
      coverImageId: img.id,
      createdById: admin.id,
    },
  });
  for (const s of buildSeasons(2, 12)) {
    await db.season.create({
      data: {
        workId: anime.id,
        number: s.number,
        episodes: { create: s.episodes.map((e) => ({ number: e.number })) },
      },
    });
  }

  const manga = await db.work.create({
    data: {
      type: "MANGA_SERIES",
      titleFr: "Berserk",
      titleNormalized: normalizeTitle("Berserk"),
      year: 1989,
      coverImageId: img.id,
      createdById: admin.id,
    },
  });
  await db.tome.createMany({
    data: buildTomes(23).map((t) => ({ workId: manga.id, number: t.number })),
  });

  const epCount = await db.episode.count({ where: { season: { workId: anime.id } } });
  const tomeCount = await db.tome.count({ where: { workId: manga.id } });

  // Recherche floue — requête identique à searchWorks()
  const q = normalizeTitle("voyahe de chihiro");
  const fuzzy = await db.$queryRaw<{ id: string; titleFr: string; sim: number }[]>(
    Prisma.sql`
      SELECT w."id", w."titleFr", similarity(w."titleNormalized", ${q}) AS "sim"
      FROM "Work" w
      WHERE w."titleNormalized" % ${q} OR w."titleNormalized" ILIKE ${"%" + q + "%"}
      ORDER BY "sim" DESC LIMIT 40`,
  );

  // Détection de doublons — requête identique à findDuplicateWorks()
  const norm = normalizeTitle("Le Voyahe de Chihiro");
  const dupes = await db.$queryRaw<{ id: string; titleFr: string; year: number; sim: number }[]>(
    Prisma.sql`
      SELECT w."id", w."titleFr", w."year", similarity(w."titleNormalized", ${norm}) AS "sim"
      FROM "Work" w
      WHERE w."titleNormalized" % ${norm} AND abs(w."year" - ${2002}) <= 1
      ORDER BY "sim" DESC LIMIT 5`,
  );

  // ── Lot 1 : suivi personnel (données individuelles) ──────────
  await db.userWork.create({
    data: {
      userId: admin.id,
      workId: film.id,
      currentRating: starsToScore(4), // 8/10
      liked: true,
      state: "COMPLETED",
    },
  });
  await db.journalEntry.create({
    data: {
      userId: admin.id,
      workId: film.id,
      loggedAt: new Date(),
      rating: starsToScore(4),
    },
  });

  // Tous les épisodes de l'anime vus → « à jour » (T2).
  const episodes = await db.episode.findMany({
    where: { season: { workId: anime.id } },
    select: { id: true },
  });
  await db.episodeWatch.createMany({
    data: episodes.map((e) => ({
      userId: admin.id,
      episodeId: e.id,
      watchedAt: new Date(),
    })),
  });
  const watched = await db.episodeWatch.count({
    where: { userId: admin.id, episode: { season: { workId: anime.id } } },
  });
  const seriesState = computeSeriesAutoState(watched, epCount);

  // Tous les tomes du manga lus → « terminé » (L4).
  const tomes = await db.tome.findMany({
    where: { workId: manga.id },
    select: { id: true },
  });
  await db.tomeProgress.createMany({
    data: tomes.map((t) => ({
      userId: admin.id,
      tomeId: t.id,
      state: "READ" as const,
    })),
  });
  const readTomes = await db.tomeProgress.count({
    where: { userId: admin.id, tome: { workId: manga.id }, state: "READ" },
  });
  const tomesState = computeTomesAutoState(readTomes, tomeCount);

  const uw = await db.userWork.findUnique({
    where: { userId_workId: { userId: admin.id, workId: film.id } },
  });

  // ── Lot 2 : reprise de l'historique ──────────────────────────
  const lot2 = await verifyImports(admin.id);

  console.log("── Résultats de vérification ─────────────────");
  console.log(`Film créé             : ${film.titleFr} (${film.year})`);
  console.log(`Anime — épisodes gén. : ${epCount} (attendu 24)`);
  console.log(`Manga — tomes gén.    : ${tomeCount} (attendu 23)`);
  console.log(
    `Film — note/j'aime    : ${uw?.currentRating}/10, j'aime=${uw?.liked} (attendu 8/10, true)`,
  );
  console.log(
    `Anime — ${watched}/${epCount} vus → statut auto : ${seriesState} (attendu CAUGHT_UP)`,
  );
  console.log(
    `Manga — ${readTomes}/${tomeCount} lus → statut auto : ${tomesState} (attendu COMPLETED)`,
  );
  console.log(
    `Recherche « voyahe de chihiro » → ${fuzzy.map((w) => `${w.titleFr} [${Number(w.sim).toFixed(2)}]`).join(", ") || "AUCUN"}`,
  );
  console.log(
    `Doublons « Le Voyahe de Chihiro » 2002 → ${dupes.map((d) => `${d.titleFr} (${d.year}) [${Number(d.sim).toFixed(2)}]`).join(", ") || "AUCUN"}`,
  );

  console.log(
    `Import — 1re passe    : ${lot2.firstWorks} fiches créées, ${lot2.firstEntries} entrées` +
      ` (attendu 4 et 5 — la 5e œuvre se rattache à la fiche existante)`,
  );
  console.log(
    `Import — fiches « à compléter » : ${lot2.needsCompletion} (attendu 4, sans visuel)`,
  );
  console.log(
    `Import — ré-import    : ${lot2.secondWorks} fiches, ${lot2.secondEntries} entrées (attendu 0 et 0)`,
  );
  console.log(
    `Import — clés dupliquées : ${lot2.duplicateKeys} (attendu 0)`,
  );

  const ok =
    epCount === 24 &&
    tomeCount === 23 &&
    fuzzy.some((w) => w.id === film.id) &&
    dupes.some((d) => d.id === film.id) &&
    uw?.currentRating === 8 &&
    uw?.liked === true &&
    seriesState === "CAUGHT_UP" &&
    tomesState === "COMPLETED" &&
    lot2.ok;
  console.log(ok ? "\n✅ TOUTES LES VÉRIFICATIONS PASSENT" : "\n❌ ÉCHEC");
  await db.$disconnect();
  process.exit(ok ? 0 : 1);
}

/**
 * Lot 2 — reprise de l'historique, contre la vraie base.
 *
 * Rejoue le pipeline complet (analyse, rapprochement pg_trgm, application)
 * puis **recommence à l'identique** : c'est le second passage qui prouve
 * l'idempotence promise par I6, et rien d'autre ne peut la démontrer.
 */
async function verifyImports(userId: string) {
  const files = loadFixture("letterboxd").filter(
    (f) => !f.name.includes("lists/") && f.name !== "profile.csv",
  );

  const titres = ["Dune", "Arrival", "Mickey 17", "Blade Runner 2049"];
  await db.importBatch.deleteMany({ where: { userId } });
  await db.journalEntry.deleteMany({ where: { userId, importKey: { not: null } } });
  await db.work.deleteMany({ where: { titleFr: { in: titres } } });

  const before = {
    works: await db.work.count(),
    entries: await db.journalEntry.count({ where: { userId } }),
  };

  const first = await runImport(userId, files);
  const afterFirst = {
    works: await db.work.count(),
    entries: await db.journalEntry.count({ where: { userId } }),
  };

  const needsCompletion = await db.work.count({
    where: { needsCompletion: true, coverImageId: null, titleFr: { in: titres } },
  });

  // Deuxième passage, fichiers identiques : rien ne doit être créé.
  const second = await runImport(userId, files);
  const afterSecond = {
    works: await db.work.count(),
    entries: await db.journalEntry.count({ where: { userId } }),
  };

  const duplicates = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM (
      SELECT "importKey" FROM "JournalEntry"
      WHERE "importKey" IS NOT NULL AND "userId" = ${userId}
      GROUP BY "userId", "importKey" HAVING count(*) > 1
    ) d`;
  const duplicateKeys = Number(duplicates[0]?.n ?? 0);

  const firstWorks = afterFirst.works - before.works;
  const firstEntries = afterFirst.entries - before.entries;
  const secondWorks = afterSecond.works - afterFirst.works;
  const secondEntries = afterSecond.entries - afterFirst.entries;

  return {
    firstWorks,
    firstEntries,
    secondWorks,
    secondEntries,
    needsCompletion,
    duplicateKeys,
    ok:
      first.targets === 5 &&
      second.targets === 5 &&
      // 5 œuvres importées, mais « Le Voyage de Chihiro » existe déjà dans le
      // catalogue (créé plus haut) : le rapprochement trigramme doit s'y
      // rattacher au lieu de créer un doublon — donc 4 fiches nouvelles.
      firstWorks === 4 &&
      firstEntries === 5 &&
      secondWorks === 0 &&
      secondEntries === 0 &&
      needsCompletion === 4 &&
      duplicateKeys === 0,
  };
}

/** Analyse puis applique un lot, sans passer par l'interface. */
async function runImport(userId: string, files: ImportedFile[]) {
  const result = letterboxdAdapter.parse(files, DEFAULT_IMPORT_OPTIONS);
  const targets = groupIntoTargets("LETTERBOXD", result.events);

  const candidatesByKey = await findImportCandidates(
    targets.map((t) => ({
      key: t.workKey,
      titleNormalized: t.titleNormalized,
      year: t.ref.year,
      type: t.ref.type,
    })),
  );

  const batch = await db.importBatch.create({
    data: { userId, source: "LETTERBOXD", status: "ANALYZED" },
  });

  for (const target of targets) {
    const decision = decideResolution(
      target.ref,
      candidatesByKey.get(target.workKey) ?? [],
    );
    const created = await db.importTarget.create({
      data: {
        batchId: batch.id,
        workKey: target.workKey,
        externalId: target.ref.externalId,
        type: target.ref.type,
        titleFr: target.ref.titleFr,
        titleNormalized: target.titleNormalized,
        year: target.ref.year,
        isbn: target.ref.isbn,
        pageCount: target.ref.pageCount,
        creators: target.ref.creators,
        extra: { seasons: target.seasons, volumes: target.volumes },
        // Le rapprochement automatique doit suffire : on ne décide rien à la main.
        resolution: decision.resolution,
        decidedBy: decision.auto ? "AUTO" : "USER",
        confidence: decision.confidence,
        matchedWorkId: decision.workId,
      },
    });
    await db.importRow.createMany({
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

  const stored = await db.importTarget.findMany({
    where: { batchId: batch.id },
    include: { rows: true },
  });

  for (const target of stored) {
    await db.$transaction(
      (tx) => applyTarget(tx, userId, "LETTERBOXD", target),
      { timeout: 30_000, maxWait: 5_000 },
    );
  }

  return { targets: stored.length };
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
