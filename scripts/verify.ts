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

  const ok =
    epCount === 24 &&
    tomeCount === 23 &&
    fuzzy.some((w) => w.id === film.id) &&
    dupes.some((d) => d.id === film.id) &&
    uw?.currentRating === 8 &&
    uw?.liked === true &&
    seriesState === "CAUGHT_UP" &&
    tomesState === "COMPLETED";
  console.log(ok ? "\n✅ TOUTES LES VÉRIFICATIONS PASSENT" : "\n❌ ÉCHEC");
  await db.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
