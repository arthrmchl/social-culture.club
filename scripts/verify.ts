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
import { markEditionTomesRead } from "../src/lib/tracking";
import { pageCountFor } from "../src/lib/editions";
import { pickCoverImageId } from "../src/lib/covers";
import { resolveCovers } from "../src/lib/cover-loader";
import { searchWorks } from "../src/lib/search";
import { MAX_FAVORITES } from "../src/lib/favorites";
import { reorderPositions } from "../src/lib/lists";
import { collectUserExport, entityToCsv } from "../src/lib/export/collect";
import { CSV_ENTITIES } from "../src/lib/export/shape";
import { accessFor, blockedUserIds } from "../src/lib/social/access";
import { buildFeedPage, type FeedItem } from "../src/lib/feed";

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

  // Publication en cours : `endYear` reste nul (lot 6).
  const manga = await db.work.create({
    data: {
      type: "MANGA_SERIES",
      titleFr: "Berserk",
      titleNormalized: normalizeTitle("Berserk"),
      originalLanguage: "ja",
      year: 1989,
      // Pas de visuel sur une lecture (lot 5) : ce sont ses éditions qui en ont.
      createdById: admin.id,
    },
  });
  // Les tomes appartiennent à l'édition (lot 6) : c'est elle qui les porte, et
  // c'est elle que le membre doit désigner pour les suivre.
  const mangaEdition = await db.edition.create({
    data: {
      workId: manga.id,
      publisher: "Glénat",
      language: "fr",
      isDefault: true,
      tomes: {
        create: buildTomes(23).map((t) => ({ number: t.number })),
      },
    },
  });

  const epCount = await db.episode.count({
    where: { season: { workId: anime.id } },
  });
  const tomeCount = await db.tome.count({
    where: { editionId: mangaEdition.id },
  });

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

  // Tous les tomes du manga lus → « terminé » (L4). Le suivi au tome exige
  // une édition désignée (lot 6) : sans elle, `recomputeTomesState` ne compte
  // rien, et la fiche n'afficherait pas de tomes à cocher.
  await db.userWork.upsert({
    where: { userId_workId: { userId: admin.id, workId: manga.id } },
    update: { editionId: mangaEdition.id },
    create: {
      userId: admin.id,
      workId: manga.id,
      editionId: mangaEdition.id,
    },
  });
  const tomes = await db.tome.findMany({
    where: { editionId: mangaEdition.id },
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
    where: {
      userId: admin.id,
      tome: { editionId: mangaEdition.id },
      state: "READ",
    },
  });
  const tomesState = computeTomesAutoState(readTomes, tomeCount);

  const uw = await db.userWork.findUnique({
    where: { userId_workId: { userId: admin.id, workId: film.id } },
  });

  // ── Lot 3 : bibliothèque riche ───────────────────────────────
  const lot3 = await verifyLibrary(admin.id, manga.id);

  // ── Lot 4 : social ───────────────────────────────────────────
  const lot4 = await verifySocial(admin.id, film.id);

  // ── Lot 5 : l'œuvre et son édition ───────────────────────────
  const lot5 = await verifyEditions(admin.id, img.id);

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
    `Édition lue d'un coup : ${lot3.covered} tomes marqués, ${lot3.readAfter} lus (attendu 5 et 5)`,
  );
  console.log(
    `Édition lue — rejeu   : ${lot3.readAfterSecond} lus (attendu 5 — idempotent)`,
  );
  console.log(
    `Édition par défaut    : ${lot3.defaultCount} sur ${lot3.editionCount} éditions (attendu 1)`,
  );
  console.log(
    `Objectif — doublon rejeté : ${lot3.goalDuplicateBlocked} (attendu true)`,
  );
  console.log(
    `Favoris — plafond ${lot3.favoriteCap} respecté : ${lot3.favoriteCount} (attendu ${lot3.favoriteCap})`,
  );
  console.log(
    `Liste — ${lot3.listItems} éléments, positions contiguës après permutation : ${lot3.positionsOk} (attendu true)`,
  );
  console.log(
    `Export — version ${lot3.exportVersion}, ${lot3.exportEntities} entités CSV (attendu 6 et 17)`,
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
  console.log(
    `Fil — entrée importée présente : ${lot4.feedHasImported} (attendu false — un import ne noie pas les abonnés)`,
  );
  console.log(
    `Fil — critique et entrée de même texte : ${lot4.dedupCount} élément (attendu 1, l'entrée : ${lot4.dedupKeptEntry})`,
  );
  console.log(
    `Fil — ordre antichronologique : ${lot4.feedDescending} (attendu true)`,
  );
  console.log(
    `Modération — entrée masquée sortie du fil : ${lot4.hiddenLeftFeed} (attendu true)`,
  );

  console.log(
    `Livre sans édition    : visuel=${lot5.coverWithoutEdition}, pages=${lot5.pagesWithoutEdition} (attendu null et null)`,
  );
  console.log(
    `Couverture — édition par défaut puis la mienne : ${lot5.coverDefault}/${lot5.coverMine} (attendu ${lot5.expectedDefault}/${lot5.expectedMine})`,
  );
  console.log(
    `Pagination — mon édition : ${lot5.pagesMine} (attendu 380, celle du poche)`,
  );
  console.log(
    `Traduction — langue et traducteur : ${lot5.language}/${lot5.translator} (attendu fr/Ludmila Savitzky)`,
  );
  console.log(
    `Recherche par l'ISBN d'une édition : ${lot5.foundByIsbn} (attendu true)`,
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
    lot3.ok &&
    lot4.ok &&
    lot5.ok;
  console.log(ok ? "\n✅ TOUTES LES VÉRIFICATIONS PASSENT" : "\n❌ ÉCHEC");
  await db.$disconnect();
  process.exit(ok ? 0 : 1);
}

/**
 * Lot 5 — l'œuvre et son édition, contre la vraie base.
 *
 * Ce que les tests unitaires ne prouvent pas : qu'un livre est bien créable
 * **sans** visuel, que la cascade de couverture interroge réellement les
 * éditions et le suivi du lecteur (deux requêtes, pas une par vignette), et
 * qu'une œuvre reste trouvable par l'ISBN d'une de ses éditions — le seul
 * endroit où cet ISBN vive désormais.
 */
async function verifyEditions(userId: string, defaultImageId: string) {
  const title = "Ulysse (vérification)";
  await db.work.deleteMany({ where: { titleFr: title } });

  const mineImage = await db.image.create({
    data: { path: "covers/poche.webp", uploadedById: userId },
  });

  // 1. Un livre naît sans visuel : D31 ne vaut plus pour une lecture.
  const book = await db.work.create({
    data: {
      type: "BOOK",
      titleFr: title,
      titleOriginal: "Ulysses",
      titleNormalized: normalizeTitle(title),
      originalLanguage: "en",
      year: 1922,
      createdById: userId,
    },
  });
  const coverWithoutEdition = pickCoverImageId(book, [], null);
  const pagesWithoutEdition = pageCountFor([], null);

  // 2. Deux éditions : l'originale par défaut, et une traduction française.
  const isbn = "9780199535675";
  await db.edition.create({
    data: {
      workId: book.id,
      publisher: "Oxford University Press",
      format: "broché",
      language: "en",
      pageCount: 210,
      isbn,
      isDefault: true,
      coverImageId: defaultImageId,
    },
  });
  const person = await db.person.upsert({
    where: { nameNormalized: normalizeTitle("Ludmila Savitzky") },
    update: {},
    create: {
      name: "Ludmila Savitzky",
      nameNormalized: normalizeTitle("Ludmila Savitzky"),
    },
  });
  const poche = await db.edition.create({
    data: {
      workId: book.id,
      title: "Ulysse",
      publisher: "Gallimard",
      format: "poche",
      language: "fr",
      pageCount: 380,
      isbn: "9782070400188",
      coverImageId: mineImage.id,
      creators: { create: { personId: person.id, role: "traducteur" } },
    },
  });

  // 3. La cascade, par le vrai chargeur : édition par défaut, puis la mienne.
  const before = await resolveCovers([book], userId);
  const coverDefault = before.get(book.id);

  await db.userWork.upsert({
    where: { userId_workId: { userId, workId: book.id } },
    update: { editionId: poche.id },
    create: { userId, workId: book.id, editionId: poche.id },
  });
  const after = await resolveCovers([book], userId);
  const coverMine = after.get(book.id);

  const editions = await db.edition.findMany({
    where: { workId: book.id },
    include: { creators: { include: { person: true } } },
  });
  const pagesMine = pageCountFor(editions, poche.id);
  const translated = editions.find((e) => e.id === poche.id)!;

  // 4. L'ISBN d'une édition retrouve son œuvre (requête réelle de searchWorks).
  const found = await searchWorks(isbn);
  const foundByIsbn = found.some((w) => w.id === book.id);

  await db.work.delete({ where: { id: book.id } });
  await db.image.delete({ where: { id: mineImage.id } });

  return {
    coverWithoutEdition,
    pagesWithoutEdition,
    coverDefault,
    coverMine,
    expectedDefault: defaultImageId,
    expectedMine: mineImage.id,
    pagesMine,
    language: translated.language,
    translator: translated.creators.map((c) => c.person.name).join(", "),
    foundByIsbn,
    ok:
      coverWithoutEdition === null &&
      pagesWithoutEdition === null &&
      coverDefault === defaultImageId &&
      coverMine === mineImage.id &&
      pagesMine === 380 &&
      translated.language === "fr" &&
      translated.creators.length === 1 &&
      foundByIsbn,
  };
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

  // ── 9. Le fil : ni entrées importées, ni doublon critique/entrée ──
  await db.user.update({
    where: { id: adminId },
    data: { visibility: "PUBLIC" },
  });
  await db.journalEntry.deleteMany({
    where: {
      userId: adminId,
      reviewText: "Exactement le même texte, à la virgule près.",
    },
  });
  await db.journalEntry.deleteMany({
    where: { userId: adminId, importKey: "verify-imported" },
  });

  const DOUBLON = "Exactement le même texte, à la virgule près.";
  // Saisie manuelle : **pas** d'importKey, sinon elle serait écartée du fil par
  // la règle même qu'on vérifie plus bas. Le nettoyage se fait par identifiant.
  const feedEntry = await db.journalEntry.create({
    data: {
      userId: adminId,
      workId,
      loggedAt: new Date(),
      reviewText: DOUBLON,
    },
  });
  // Une entrée importée : elle ne doit jamais atteindre le fil, sans quoi un
  // import de 3 000 lignes noierait les abonnés.
  const importedEntry = await db.journalEntry.create({
    data: {
      userId: adminId,
      workId,
      loggedAt: new Date(),
      importKey: "verify-imported",
    },
  });
  // Et la critique d'œuvre qui répète mot pour mot l'entrée.
  await db.userWork.upsert({
    where: { userId_workId: { userId: adminId, workId } },
    update: { reviewText: DOUBLON, reviewedAt: new Date(), hiddenAt: null },
    create: {
      userId: adminId,
      workId,
      reviewText: DOUBLON,
      reviewedAt: new Date(),
    },
  });

  const feedSources = await fetchFeedSourcesForVerify(db, adminId);
  const merged = buildFeedPage(feedSources, 50);

  const feedHasImported = merged.items.some((i) => i.id === importedEntry.id);
  // Le texte identique doit produire **un** élément, et ce doit être l'entrée
  // de journal — elle porte date, sous-unité, revisionnage et étiquettes.
  const dedupCount = merged.items.filter((i) => i.text === DOUBLON).length;
  const dedupKeptEntry =
    merged.items.find((i) => i.text === DOUBLON)?.kind === "entry";
  const feedDescending = merged.items.every(
    (item, i) => i === 0 || merged.items[i - 1].at >= item.at,
  );

  // ── 10. Masquage : le contenu sort du fil, sauf pour son auteur ──
  await db.journalEntry.update({
    where: { id: feedEntry.id },
    data: { hiddenAt: new Date() },
  });
  const afterHide = buildFeedPage(
    await fetchFeedSourcesForVerify(db, adminId),
    50,
  );
  const hiddenLeftFeed = !afterHide.items.some((i) => i.id === feedEntry.id);

  // Nettoyage de sortie : on rend le compte administrateur à son état.
  await db.journalEntry.deleteMany({
    where: { id: { in: [feedEntry.id, importedEntry.id] } },
  });
  await db.userWork.updateMany({
    where: { userId: adminId, workId },
    data: { reviewText: null, reviewedAt: null },
  });
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
    feedHasImported,
    dedupCount,
    dedupKeptEntry,
    feedDescending,
    hiddenLeftFeed,
    ok:
      followDuplicateBlocked &&
      likesAcrossTargets === 2 &&
      likeDuplicateBlocked &&
      orphansAfterDelete === 0 &&
      accountDeleted &&
      reportSurvived &&
      privateBefore === false &&
      privateAfter === true &&
      blockSymmetric &&
      feedHasImported === false &&
      dedupCount === 1 &&
      dedupKeptEntry &&
      feedDescending &&
      hiddenLeftFeed,
  };
}

/**
 * Les trois sources du fil, telles que `feed-query.ts` les interroge.
 *
 * Les clauses sont recopiées ici plutôt qu'importées, parce que `getFeed` lit
 * la session — et le script n'a pas de requête HTTP. C'est le seul endroit du
 * lot où une requête est dupliquée : les filtres qui comptent (`importKey`,
 * `hiddenAt`) sont donc vérifiés en tant que tels, et la fusion, elle, passe
 * par la vraie `buildFeedPage`.
 */
async function fetchFeedSourcesForVerify(
  client: PrismaClient,
  userId: string,
): Promise<FeedItem[][]> {
  const before = new Date(Date.now() + 60_000);

  const [entries, reviews] = await Promise.all([
    client.journalEntry.findMany({
      where: {
        userId,
        hiddenAt: null,
        importKey: null,
        createdAt: { lt: before },
      },
      orderBy: { createdAt: "desc" },
      take: 51,
      select: {
        id: true,
        userId: true,
        createdAt: true,
        reviewText: true,
        workId: true,
      },
    }),
    client.userWork.findMany({
      where: {
        userId,
        hiddenAt: null,
        reviewText: { not: null },
        reviewedAt: { not: null, lt: before },
      },
      orderBy: { reviewedAt: "desc" },
      take: 51,
      select: {
        id: true,
        userId: true,
        reviewedAt: true,
        reviewText: true,
        workId: true,
      },
    }),
  ]);

  return [
    entries.map((e) => ({
      kind: "entry" as const,
      id: e.id,
      authorId: e.userId,
      at: e.createdAt,
      workId: e.workId,
      text: e.reviewText,
    })),
    reviews.map((r) => ({
      kind: "review" as const,
      id: r.id,
      authorId: r.userId,
      at: r.reviewedAt!,
      workId: r.workId,
      text: r.reviewText,
    })),
  ];
}

/**
 * Lot 3 — bibliothèque riche, contre la vraie base.
 *
 * Ce que les tests unitaires ne peuvent pas dire : que les contraintes
 * d'unicité tiennent réellement, que « j'ai lu cette édition » est idempotent,
 * et que l'export nomme bien toutes ses entités.
 */
async function verifyLibrary(userId: string, mangaId: string) {
  await db.tomeProgress.deleteMany({
    where: { userId, tome: { edition: { workId: mangaId } } },
  });
  // Table rase des éditions du manga : celle du bloc précédent a déjà tout dit,
  // et les deux comptages ci-dessous partent de zéro.
  await db.edition.deleteMany({ where: { workId: mangaId } });
  await db.goal.deleteMany({ where: { userId } });
  await db.favorite.deleteMany({ where: { userId } });

  // 1. Une intégrale n'est plus qu'une édition à peu de volumes (lot 6) :
  //    « j'ai lu cette édition » marque ses cinq tomes, le rejeu n'ajoute rien.
  const omnibus = await db.edition.create({
    data: {
      workId: mangaId,
      format: "intégrale",
      publisher: "Glénat",
      isDefault: true,
      tomes: { create: buildTomes(5).map((t) => ({ number: t.number })) },
    },
  });
  // Le décompte suit l'édition désignée : c'est celle-ci qu'on lit ici.
  await db.userWork.update({
    where: { userId_workId: { userId, workId: mangaId } },
    data: { editionId: omnibus.id },
  });

  const covered = await db.$transaction((tx) =>
    markEditionTomesRead(tx, userId, mangaId, omnibus.id),
  );
  const readAfter = await db.tomeProgress.count({
    where: { userId, tome: { editionId: omnibus.id }, state: "READ" },
  });

  await db.$transaction((tx) =>
    markEditionTomesRead(tx, userId, mangaId, omnibus.id),
  );
  const readAfterSecond = await db.tomeProgress.count({
    where: { userId, tome: { editionId: omnibus.id }, state: "READ" },
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

  // 3. Objectifs : une seule cible par année et par portée.
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

  // 4. Favoris : le plafond est tenu par l'action, la base garantit l'unicité.
  //    Il faut assez d'œuvres pour l'atteindre — depuis le retrait de l'import,
  //    la base de vérification n'en compte plus que trois, d'où ce complément.
  const owner = await db.work.findFirst({ select: { createdById: true } });
  for (let i = await db.work.count(); i < MAX_FAVORITES; i++) {
    const titre = `Fiche de complément ${i}`;
    await db.work.create({
      data: {
        type: "FILM",
        titleFr: titre,
        titleNormalized: normalizeTitle(titre),
        year: 2000 + i,
        createdById: owner!.createdById,
      },
    });
  }
  const works = await db.work.findMany({
    take: MAX_FAVORITES,
    select: { id: true },
  });
  await db.favorite.createMany({
    data: works.map((w, i) => ({ userId, workId: w.id, position: i })),
  });
  const favoriteCount = await db.favorite.count({ where: { userId } });

  // 5. Listes : positions contiguës à partir de 0, et permutation sans trou.
  //    Le lot 2 en fournissait par le rejeu des listes Letterboxd ; depuis son
  //    retrait, c'est ici qu'elles se vérifient — c'est de toute façon leur lot.
  await db.list.deleteMany({ where: { userId } });
  const list = await db.list.create({
    data: {
      userId,
      title: "Liste de vérification",
      slug: "liste-de-verification",
      isRanked: true,
      items: {
        create: works.map((w, i) => ({ workId: w.id, position: i })),
      },
    },
    include: { items: { orderBy: { position: "asc" } } },
  });

  // Le premier passe en dernier : seules les lignes déplacées sont réécrites.
  const moves = reorderPositions(
    list.items,
    list.items[0].id,
    works.length - 1,
  );
  await db.$transaction(
    moves.map((m) =>
      db.listItem.update({
        where: { id: m.id },
        data: { position: m.position },
      }),
    ),
  );
  const reordered = await db.listItem.findMany({
    where: { listId: list.id },
    orderBy: { position: "asc" },
    select: { id: true, position: true },
  });
  const positionsOk =
    reordered.every((it, i) => it.position === i) &&
    reordered.at(-1)?.id === list.items[0].id;

  // 6. Export : le document annonce sa version et couvre toutes ses entités.
  const doc = await collectUserExport(userId);
  const csvOk = CSV_ENTITIES.every(
    (entity) => entityToCsv(doc, entity).length > 0,
  );

  await db.goal.deleteMany({ where: { userId } });
  await db.favorite.deleteMany({ where: { userId } });
  await db.edition.deleteMany({ where: { workId: mangaId } });

  return {
    covered,
    readAfter,
    readAfterSecond,
    listItems: reordered.length,
    positionsOk,
    defaultCount,
    editionCount,
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
      goalDuplicateBlocked &&
      favoriteCount === MAX_FAVORITES &&
      positionsOk &&
      doc.version === 6 &&
      doc.lists.length > 0 &&
      csvOk,
  };
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
