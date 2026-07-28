/**
 * Vérification de la couche données du lot 0 contre la vraie base :
 * création d'œuvres + sous-unités (générateurs), recherche floue (pg_trgm)
 * et détection de doublons — via les MÊMES requêtes SQL que src/lib/search.ts.
 * Usage : npx tsx scripts/verify.ts
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { normalizeTitle } from "../src/lib/text";
import { buildSeasons, buildTomes } from "../src/lib/generators";
import { starsToScore } from "../src/lib/rating";
import {
  computeSeriesAutoState,
  computeTomesAutoState,
} from "../src/lib/progress";
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
import { applyEditionCoverage } from "../src/lib/tracking";
import { isReading } from "../src/lib/media";
import { MAX_FAVORITES } from "../src/lib/favorites";
import { collectUserExport, entityToCsv } from "../src/lib/export/collect";
import { CSV_ENTITIES } from "../src/lib/export/shape";
import { accessFor, blockedUserIds } from "../src/lib/social/access";

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

  const epCount = await db.episode.count({
    where: { season: { workId: anime.id } },
  });
  const tomeCount = await db.tome.count({ where: { workId: manga.id } });

  // Recherche floue — requête identique à searchWorks()
  const q = normalizeTitle("voyahe de chihiro");
  const fuzzy = await db.$queryRaw<
    { id: string; titleFr: string; sim: number }[]
  >(
    Prisma.sql`
      SELECT w."id", w."titleFr", similarity(w."titleNormalized", ${q}) AS "sim"
      FROM "Work" w
      WHERE w."titleNormalized" % ${q} OR w."titleNormalized" ILIKE ${"%" + q + "%"}
      ORDER BY "sim" DESC LIMIT 40`,
  );

  // Détection de doublons — requête identique à findDuplicateWorks()
  const norm = normalizeTitle("Le Voyahe de Chihiro");
  const dupes = await db.$queryRaw<
    { id: string; titleFr: string; year: number; sim: number }[]
  >(
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

  // ── Lot 3 : bibliothèque riche ───────────────────────────────
  const lot3 = await verifyLibrary(admin.id, manga.id, film.id);

  // ── Lot 4 : social ───────────────────────────────────────────
  const lot4 = await verifySocial(admin.id, film.id);

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
  console.log(`Import — clés dupliquées : ${lot2.duplicateKeys} (attendu 0)`);
  console.log(
    `Listes — « Mes favoris » : ${lot2.listTitles.join(", ") || "AUCUNE"}` +
      ` (attendu Dune, Arrival — classement=${lot2.listRanked})`,
  );
  console.log(
    `Listes — rejeu        : ${lot2.listsAfterSecond} liste, ${lot2.itemsAfterSecond} éléments (attendu 1 et 2)`,
  );
  console.log(
    `Étiquettes — journal  : ${lot2.tagsAfterFirst} puis ${lot2.tagsAfterSecond} après rejeu (attendu 2 et 2)`,
  );

  console.log(
    `Intégrale T1–T5       : ${lot3.covered} tomes marqués, ${lot3.readAfter} lus (attendu 5 et 5)`,
  );
  console.log(
    `Intégrale — rejeu     : ${lot3.readAfterSecond} lus (attendu 5 — idempotent)`,
  );
  console.log(
    `Édition par défaut    : ${lot3.defaultCount} sur ${lot3.editionCount} éditions (attendu 1)`,
  );
  console.log(
    `Citation — lecture/film : ${lot3.quoteOnReading}/${lot3.quoteOnFilm} (attendu true/false — D9)`,
  );
  console.log(
    `Objectif — doublon rejeté : ${lot3.goalDuplicateBlocked} (attendu true)`,
  );
  console.log(
    `Favoris — plafond ${lot3.favoriteCap} respecté : ${lot3.favoriteCount} (attendu ${lot3.favoriteCap})`,
  );
  console.log(
    `Export — version ${lot3.exportVersion}, ${lot3.exportEntities} entités CSV (attendu 2 et 14)`,
  );

  console.log(
    `Abonnement — doublon rejeté : ${lot4.followDuplicateBlocked} (attendu true)`,
  );
  console.log(
    `J'aime — entrée + liste par le même membre : ${lot4.likesAcrossTargets} (attendu 2 — les NULL ne se gênent pas)`,
  );
  console.log(
    `J'aime — doublon sur la même entrée rejeté : ${lot4.likeDuplicateBlocked} (attendu true)`,
  );
  console.log(
    `Cascade — entrée supprimée → j'aime/commentaires/notifications : ${lot4.orphansAfterDelete} (attendu 0)`,
  );
  console.log(
    `Suppression de compte — chargé de social : ${lot4.accountDeleted} (attendu true, sans erreur de contrainte)`,
  );
  console.log(
    `Suppression de compte — signalement survivant, reporterId à NULL : ${lot4.reportSurvived} (attendu true)`,
  );
  console.log(
    `Visibilité PRIVATE — avant/après acceptation : ${lot4.privateBefore}/${lot4.privateAfter} (attendu false/true)`,
  );
  console.log(
    `Blocage — symétrie A↔B : ${lot4.blockSymmetric} (attendu true — stocké dans un sens, appliqué dans les deux)`,
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
    lot2.ok &&
    lot3.ok &&
    lot4.ok;
  console.log(ok ? "\n✅ TOUTES LES VÉRIFICATIONS PASSENT" : "\n❌ ÉCHEC");
  await db.$disconnect();
  process.exit(ok ? 0 : 1);
}

/**
 * Lot 4 — social, contre la vraie base.
 *
 * Trois choses ne peuvent être prouvées que d'ici. Les contraintes d'unicité,
 * d'abord — et surtout la cohabitation des trois uniques de `SocialLike`, qui
 * repose sur le fait que PostgreSQL considère les NULL comme distincts. La
 * **suppression de compte**, ensuite : `Work.createdById` est en Restrict, une
 * seule clé étrangère sociale mal déclarée ferait échouer `db.user.delete()`,
 * et cela ne se verrait qu'au départ d'un membre. Les règles de visibilité,
 * enfin, exercées par `accessFor` — le chemin réel des pages, pas une
 * réimplémentation qui pourrait diverger.
 */
async function verifySocial(adminId: string, workId: string) {
  const JETABLE = "verify-jetable@social-culture.club";

  // Nettoyage d'entrée : le script doit être rejouable.
  await db.user.deleteMany({ where: { email: JETABLE } });
  await db.journalEntry.deleteMany({ where: { importKey: "verify-social" } });

  const jetable = await db.user.create({
    data: {
      id: randomUUID(),
      name: "Compte jetable",
      email: JETABLE,
      username: `verif-${Date.now().toString(36)}`,
      emailVerified: true,
    },
  });

  // ── 1. Abonnement : l'unique mord ────────────────────────────
  await db.follow.create({
    data: { followerId: jetable.id, followingId: adminId, status: "PENDING" },
  });
  let followDuplicateBlocked = false;
  try {
    await db.follow.create({
      data: { followerId: jetable.id, followingId: adminId },
    });
  } catch {
    followDuplicateBlocked = true;
  }

  // ── 2 & 3. J'aime : trois uniques qui ne se gênent pas ───────
  const entry = await db.journalEntry.create({
    data: {
      userId: adminId,
      workId,
      loggedAt: new Date(),
      reviewText: "Critique de vérification.",
      importKey: "verify-social",
    },
  });
  const list = await db.list.upsert({
    where: { userId_slug: { userId: adminId, slug: "verif-social" } },
    update: {},
    create: { userId: adminId, title: "Vérif social", slug: "verif-social" },
  });

  // Le même membre aime une entrée **et** une liste : les deux lignes ont
  // `userId` en commun et diffèrent par la colonne renseignée. Sans la
  // distinction des NULL, la seconde serait rejetée.
  await db.socialLike.create({
    data: { userId: jetable.id, journalEntryId: entry.id },
  });
  await db.socialLike.create({
    data: { userId: jetable.id, listId: list.id },
  });
  const likesAcrossTargets = await db.socialLike.count({
    where: { userId: jetable.id },
  });

  let likeDuplicateBlocked = false;
  try {
    await db.socialLike.create({
      data: { userId: jetable.id, journalEntryId: entry.id },
    });
  } catch {
    likeDuplicateBlocked = true;
  }

  // ── 4. Cascade au départ d'un contenu ────────────────────────
  const comment = await db.comment.create({
    data: {
      authorId: jetable.id,
      journalEntryId: entry.id,
      body: "Commentaire de vérification.",
    },
  });
  await db.notification.create({
    data: {
      userId: adminId,
      actorId: jetable.id,
      type: "COMMENT",
      journalEntryId: entry.id,
      commentId: comment.id,
    },
  });

  await db.journalEntry.delete({ where: { id: entry.id } });
  const orphansAfterDelete =
    (await db.socialLike.count({ where: { journalEntryId: entry.id } })) +
    (await db.comment.count({ where: { journalEntryId: entry.id } })) +
    (await db.notification.count({ where: { journalEntryId: entry.id } }));

  // ── 5 & 6. Suppression de compte chargé de social ────────────
  // La garde anti-régression du piège `Work.createdById` en Restrict : toute
  // FK sociale vers User mal déclarée fait échouer ce delete.
  await db.report.create({
    data: {
      reporterId: jetable.id,
      targetKind: "LIST",
      targetLabel: list.title,
      listId: list.id,
      reason: "SPAM",
    },
  });
  await db.correctionSuggestion.create({
    data: { workId, authorId: jetable.id, message: "Année à vérifier." },
  });
  await db.notification.create({
    data: { userId: adminId, actorId: jetable.id, type: "FOLLOW" },
  });
  await db.block.create({
    data: { blockerId: jetable.id, blockedId: adminId },
  });

  let accountDeleted = false;
  try {
    await db.user.delete({ where: { id: jetable.id } });
    accountDeleted = true;
  } catch (e) {
    console.error("Suppression du compte jetable :", e);
  }

  // Le signalement survit au départ de son rapporteur (SetNull) — sans quoi
  // l'historique de modération se viderait à chaque compte supprimé.
  const survivor = await db.report.findFirst({
    where: { listId: list.id, targetKind: "LIST" },
    select: { reporterId: true },
  });
  const reportSurvived = survivor !== null && survivor.reporterId === null;

  // ── 7. Visibilité : le chemin réel des pages ─────────────────
  const membre = await db.user.findFirst({
    where: { role: { not: "admin" }, email: { not: JETABLE } },
    select: { id: true },
  });
  const viewer = membre ? { id: membre.id, isAdmin: false } : null;

  const previousVisibility = (
    await db.user.findUniqueOrThrow({
      where: { id: adminId },
      select: { visibility: true },
    })
  ).visibility;

  await db.user.update({
    where: { id: adminId },
    data: { visibility: "PRIVATE" },
  });
  await db.follow.deleteMany({
    where: { followerId: membre?.id, followingId: adminId },
  });

  const before = await accessFor(viewer, adminId);
  const privateBefore = before?.access.canSeeJournal ?? false;

  if (membre) {
    await db.follow.create({
      data: {
        followerId: membre.id,
        followingId: adminId,
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
    });
  }
  const after = await accessFor(viewer, adminId);
  const privateAfter = after?.access.canSeeJournal ?? false;

  // ── 8. Symétrie du blocage ───────────────────────────────────
  let blockSymmetric = false;
  if (membre) {
    await db.block.deleteMany({
      where: {
        OR: [
          { blockerId: adminId, blockedId: membre.id },
          { blockerId: membre.id, blockedId: adminId },
        ],
      },
    });
    await db.block.create({
      data: { blockerId: adminId, blockedId: membre.id },
    });
    // Stocké dans un seul sens, il doit se lire dans les deux.
    const seenByBlocked = await blockedUserIds(membre.id);
    const seenByBlocker = await blockedUserIds(adminId);
    blockSymmetric =
      seenByBlocked.includes(adminId) && seenByBlocker.includes(membre.id);

    await db.block.deleteMany({
      where: { blockerId: adminId, blockedId: membre.id },
    });
  }

  // Nettoyage de sortie : on rend le compte administrateur à son état.
  await db.user.update({
    where: { id: adminId },
    data: { visibility: previousVisibility },
  });
  await db.follow.deleteMany({ where: { followingId: adminId } });
  await db.list.deleteMany({ where: { id: list.id } });
  await db.report.deleteMany({ where: { targetLabel: list.title } });

  return {
    followDuplicateBlocked,
    likesAcrossTargets,
    likeDuplicateBlocked,
    orphansAfterDelete,
    accountDeleted,
    reportSurvived,
    privateBefore,
    privateAfter,
    blockSymmetric,
    ok:
      followDuplicateBlocked &&
      likesAcrossTargets === 2 &&
      likeDuplicateBlocked &&
      orphansAfterDelete === 0 &&
      accountDeleted &&
      reportSurvived &&
      privateBefore === false &&
      privateAfter === true &&
      blockSymmetric,
  };
}

/**
 * Lot 3 — bibliothèque riche, contre la vraie base.
 *
 * Ce que les tests unitaires ne peuvent pas dire : que les contraintes
 * d'unicité tiennent réellement, que la couverture d'une intégrale est
 * idempotente, et que l'export nomme bien toutes ses entités.
 */
async function verifyLibrary(userId: string, mangaId: string, filmId: string) {
  await db.tomeProgress.deleteMany({
    where: { userId, tome: { workId: mangaId } },
  });
  await db.edition.deleteMany({ where: { workId: mangaId } });
  await db.quote.deleteMany({ where: { userId } });
  await db.goal.deleteMany({ where: { userId } });
  await db.favorite.deleteMany({ where: { userId } });

  // 1. Intégrale : lire T1–T5 marque cinq tomes, et le rejeu n'en ajoute pas.
  const omnibus = await db.edition.create({
    data: {
      workId: mangaId,
      format: "intégrale",
      publisher: "Glénat",
      coversTomeFrom: 1,
      coversTomeTo: 5,
      isDefault: true,
    },
  });

  const covered = await db.$transaction((tx) =>
    applyEditionCoverage(tx, userId, mangaId, omnibus.id),
  );
  const readAfter = await db.tomeProgress.count({
    where: { userId, tome: { workId: mangaId }, state: "READ" },
  });

  await db.$transaction((tx) =>
    applyEditionCoverage(tx, userId, mangaId, omnibus.id),
  );
  const readAfterSecond = await db.tomeProgress.count({
    where: { userId, tome: { workId: mangaId }, state: "READ" },
  });

  // 2. Une seule édition par défaut, invariante tenue par l'action.
  const second = await db.edition.create({
    data: { workId: mangaId, format: "poche", publisher: "Glénat" },
  });
  await db.$transaction(async (tx) => {
    await tx.edition.updateMany({
      where: { workId: mangaId, isDefault: true },
      data: { isDefault: false },
    });
    await tx.edition.update({
      where: { id: second.id },
      data: { isDefault: true },
    });
  });
  const defaultCount = await db.edition.count({
    where: { workId: mangaId, isDefault: true },
  });
  const editionCount = await db.edition.count({ where: { workId: mangaId } });

  // 3. Citations : lectures uniquement (D9).
  const manga = await db.work.findUniqueOrThrow({ where: { id: mangaId } });
  const film = await db.work.findUniqueOrThrow({ where: { id: filmId } });
  const quoteOnReading = isReading(manga.type);
  const quoteOnFilm = isReading(film.type);
  await db.quote.create({
    data: { userId, workId: mangaId, text: "Un passage.", page: 42 },
  });

  // 4. Objectifs : une seule cible par année et par portée.
  const year = new Date().getFullYear();
  await db.goal.create({
    data: { userId, year, scope: "READINGS", target: 10 },
  });
  let goalDuplicateBlocked = false;
  try {
    await db.goal.create({
      data: { userId, year, scope: "READINGS", target: 20 },
    });
  } catch {
    goalDuplicateBlocked = true;
  }

  // 5. Favoris : le plafond est tenu par l'action, la base garantit l'unicité.
  const works = await db.work.findMany({
    take: MAX_FAVORITES,
    select: { id: true },
  });
  await db.favorite.createMany({
    data: works.map((w, i) => ({ userId, workId: w.id, position: i })),
  });
  const favoriteCount = await db.favorite.count({ where: { userId } });

  // 6. Export : le document annonce sa version et couvre toutes ses entités.
  const doc = await collectUserExport(userId);
  const csvOk = CSV_ENTITIES.every(
    (entity) => entityToCsv(doc, entity).length > 0,
  );

  await db.quote.deleteMany({ where: { userId } });
  await db.goal.deleteMany({ where: { userId } });
  await db.favorite.deleteMany({ where: { userId } });
  await db.edition.deleteMany({ where: { workId: mangaId } });

  return {
    covered,
    readAfter,
    readAfterSecond,
    defaultCount,
    editionCount,
    quoteOnReading,
    quoteOnFilm,
    goalDuplicateBlocked,
    favoriteCount,
    favoriteCap: MAX_FAVORITES,
    exportVersion: doc.version,
    exportEntities: CSV_ENTITIES.length,
    ok:
      covered === 5 &&
      readAfter === 5 &&
      readAfterSecond === 5 &&
      defaultCount === 1 &&
      editionCount === 2 &&
      quoteOnReading &&
      !quoteOnFilm &&
      goalDuplicateBlocked &&
      favoriteCount === MAX_FAVORITES &&
      doc.version === 2 &&
      doc.lists.length > 0 &&
      csvOk,
  };
}

/**
 * Lot 2 — reprise de l'historique, contre la vraie base.
 *
 * Rejoue le pipeline complet (analyse, rapprochement pg_trgm, application)
 * puis **recommence à l'identique** : c'est le second passage qui prouve
 * l'idempotence promise par I6, et rien d'autre ne peut la démontrer.
 */
async function verifyImports(userId: string) {
  // Les listes ne sont plus mises de côté : depuis le lot 3 elles font partie
  // de l'import, et leur idempotence doit être prouvée au même titre.
  const files = loadFixture("letterboxd").filter(
    (f) => f.name !== "profile.csv",
  );

  const titres = ["Dune", "Arrival", "Mickey 17", "Blade Runner 2049"];
  await db.importBatch.deleteMany({ where: { userId } });
  await db.journalEntry.deleteMany({
    where: { userId, importKey: { not: null } },
  });
  await db.list.deleteMany({ where: { userId, importKey: { not: null } } });
  await db.tag.deleteMany({ where: { userId } });
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
    where: {
      needsCompletion: true,
      coverImageId: null,
      titleFr: { in: titres },
    },
  });

  // Listes et étiquettes reprises de l'export (lot 3, S9 et S10).
  const listAfterFirst = await db.list.findFirst({
    where: { userId, importKey: "letterboxd:list:mes-favoris" },
    include: {
      items: { orderBy: { position: "asc" }, include: { work: true } },
    },
  });
  const tagsAfterFirst = await db.journalEntryTag.count({
    where: { tag: { userId } },
  });

  // Deuxième passage, fichiers identiques : rien ne doit être créé.
  const second = await runImport(userId, files);
  const afterSecond = {
    works: await db.work.count(),
    entries: await db.journalEntry.count({ where: { userId } }),
  };

  const listsAfterSecond = await db.list.count({
    where: { userId, importKey: { not: null } },
  });
  const itemsAfterSecond = await db.listItem.count({
    where: { list: { userId, importKey: { not: null } } },
  });
  const tagsAfterSecond = await db.journalEntryTag.count({
    where: { tag: { userId } },
  });

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

  const listTitles = listAfterFirst?.items.map((i) => i.work.titleFr) ?? [];

  return {
    firstWorks,
    firstEntries,
    secondWorks,
    secondEntries,
    needsCompletion,
    duplicateKeys,
    listTitles,
    listRanked: listAfterFirst?.isRanked ?? false,
    listsAfterSecond,
    itemsAfterSecond,
    tagsAfterFirst,
    tagsAfterSecond,
    ok:
      first.targets === 5 &&
      second.targets === 5 &&
      // Listes (S9) : « Mes favoris » reprend Dune et Arrival, dans l'ordre du
      // classement, et le rejeu n'en duplique aucun.
      listAfterFirst !== null &&
      listAfterFirst.isRanked === true &&
      listTitles.join(",") === "Dune,Arrival" &&
      listsAfterSecond === 1 &&
      itemsAfterSecond === 2 &&
      // Étiquettes (S10) : les tags du diary rejoignent les entrées, et le
      // rejeu les rattache aux mêmes entrées plutôt que d'en créer d'autres.
      tagsAfterFirst === 2 &&
      tagsAfterSecond === 2 &&
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
