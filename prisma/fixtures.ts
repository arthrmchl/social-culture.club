/**
 * Jeu de fixtures de l'environnement de test — déterministe, versionné.
 *
 * Ce que le seed produit (comptes, genres) ne suffit pas aux scénarios e2e :
 * `lot3` cherche « chihiro » dans la recherche floue, ouvre le premier manga du
 * catalogue et attend une bibliothèque non vide ; `lot4` attend un journal
 * public de l'administrateur. Ces prérequis venaient jusqu'ici des **effets de
 * bord de `scripts/verify.ts`** laissés dans la base de développement — une
 * dépendance invisible qui faisait échouer les tests sur une base neuve.
 *
 * Ils sont désormais explicites et rejoués à l'identique à chaque montage.
 * Rien d'aléatoire ici : ni `randomUUID()`, ni `Date.now()`, ni identifiant
 * généré. Deux exécutions produisent exactement la même base.
 *
 * S'applique **après** `prisma/seed.ts`, dont il réutilise les comptes.
 * N'est jamais joué contre la base de développement : seul `scripts/test-db.ts`
 * l'invoque.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { normalizeTitle } from "../src/lib/text";
import { buildSeasons, buildTomes } from "../src/lib/generators";
import { starsToScore } from "../src/lib/rating";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

/**
 * Identifiants figés — une URL `/oeuvre/<id>` relevée dans un rapport d'échec
 * reste valable au run suivant. **Uniquement `[a-z0-9]`** : les specs assertent
 * `/\/oeuvre\/[a-z0-9]+$/`, un tiret ferait échouer la navigation.
 */
const W = {
  chihiro: "fixtwork0chihiro",
  frieren: "fixtwork0frieren",
  berserk: "fixtwork0berserk",
} as const;

/** L'édition qui porte les tomes de Berserk (lot 6) — identifiant figé lui aussi. */
const BERSERK_EDITION = "fixtberserk0ed1";

/** Le code d'invitation consommé par `e2e/lot0.spec.ts`. */
const E2E_INVITE_CODE = "SCC-E2E-0001";

/** Date figée, à midi UTC pour rester au même jour sous tout fuseau. */
function day(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

async function main() {
  const admin = await db.user.findFirst({ where: { role: "admin" } });
  if (!admin) throw new Error("Admin introuvable — lancer le seed d'abord.");

  // ─── Invitation e2e ───────────────────────────────────────
  // Portée par les fixtures et non plus par `global-setup` : c'est une donnée
  // de départ comme une autre. Son expiration est la seule valeur relative du
  // fichier — une date en dur finirait par être dépassée.
  await db.invitation.create({
    data: {
      id: "fixtinvite0e2e",
      code: E2E_INVITE_CODE,
      invitedById: admin.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
    },
  });

  const genres = new Map(
    (await db.genre.findMany()).map((g) => [g.name, g.id] as const),
  );
  const genreIds = (...names: string[]) =>
    names.flatMap((n) => (genres.has(n) ? [{ genreId: genres.get(n)! }] : []));

  // ─── Un film ──────────────────────────────────────────────
  // `coverImageId: null` : la vignette de substitution est calculée à
  // l'affichage (src/lib/placeholder.ts), il n'y a rien à téléverser. Et
  // `needsCompletion: false`, sinon la fiche apparaîtrait dans /a-completer,
  // dont `lot2` compte les entrées.
  await db.work.create({
    data: {
      id: W.chihiro,
      type: "FILM",
      titleFr: "Le Voyage de Chihiro",
      titleOriginal: "千と千尋の神隠し",
      titleNormalized: normalizeTitle("Le Voyage de Chihiro"),
      originalLanguage: "ja",
      year: 2001,
      durationMinutes: 125,
      synopsis:
        "Une fillette égarée dans le monde des esprits doit y travailler pour libérer ses parents.",
      needsCompletion: false,
      createdById: admin.id,
      createdAt: day("2024-01-05"),
      genres: { create: genreIds("Animation", "Fantastique") },
    },
  });

  // ─── Un animé, saisons et épisodes ────────────────────────
  await db.work.create({
    data: {
      id: W.frieren,
      type: "ANIME",
      titleFr: "Frieren",
      titleOriginal: "葬送のフリーレン",
      titleNormalized: normalizeTitle("Frieren"),
      originalLanguage: "ja",
      year: 2023,
      durationMinutes: 24,
      needsCompletion: false,
      createdById: admin.id,
      createdAt: day("2024-01-06"),
      genres: { create: genreIds("Animation", "Fantasy") },
      seasons: {
        create: buildSeasons(2, 12).map((s) => ({
          id: `fixtfrieren0s${s.number}`,
          number: s.number,
          title: s.title,
          episodes: {
            create: s.episodes.map((e) => ({
              id: `fixtfrieren0s${s.number}e${String(e.number).padStart(2, "0")}`,
              number: e.number,
              title: e.title,
              durationMinutes: 24,
            })),
          },
        })),
      },
    },
  });

  // ─── Un manga, et l'édition qui porte ses tomes ───────────
  // Depuis le lot 6, les tomes appartiennent au tirage : sans édition, la
  // fiche n'aurait rien à cocher et `lot1` perdrait son suivi au tome.
  // Publication toujours en cours : `endYear` reste nul, la fiche affiche
  // « 1989 – en cours ».
  await db.work.create({
    data: {
      id: W.berserk,
      type: "MANGA_SERIES",
      titleFr: "Berserk",
      titleOriginal: "ベルセルク",
      titleNormalized: normalizeTitle("Berserk"),
      originalLanguage: "ja",
      year: 1989,
      needsCompletion: false,
      createdById: admin.id,
      createdAt: day("2024-01-07"),
      genres: { create: genreIds("Fantastique", "Seinen") },
      editions: {
        create: {
          id: BERSERK_EDITION,
          publisher: "Glénat",
          language: "fr",
          format: "broché",
          isDefault: true,
          createdAt: day("2024-01-07"),
          tomes: {
            create: buildTomes(12).map((t) => ({
              id: `fixtberserk0t${String(t.number).padStart(2, "0")}`,
              number: t.number,
              title: t.title,
              pageCount: 224,
            })),
          },
        },
      },
    },
  });

  // ─── Auteurs ──────────────────────────────────────────────
  for (const [name, workId, role] of [
    ["Hayao Miyazaki", W.chihiro, "réalisateur"],
    ["Kanehito Yamada", W.frieren, "auteur"],
    ["Kentarō Miura", W.berserk, "auteur"],
  ] as const) {
    const person = await db.person.create({
      data: { name, nameNormalized: normalizeTitle(name) },
    });
    await db.workCreator.create({
      data: { workId, personId: person.id, role },
    });
  }

  // ─── Le suivi de l'administrateur ─────────────────────────
  // Sans lui, /bibliotheque est vide (lot 3) et le journal public de l'admin
  // n'a rien à montrer (lot 4).
  await db.userWork.create({
    data: {
      userId: admin.id,
      workId: W.chihiro,
      state: "COMPLETED",
      currentRating: starsToScore(4.5),
      liked: true,
      finishedAt: day("2024-03-02"),
      createdAt: day("2024-03-02"),
    },
  });

  await db.userWork.create({
    data: {
      userId: admin.id,
      workId: W.frieren,
      state: "CAUGHT_UP",
      currentRating: starsToScore(4),
      startedAt: day("2024-04-10"),
      createdAt: day("2024-04-10"),
    },
  });

  // L'édition lue est désignée : sans elle, pas de suivi au tome (lot 6) —
  // la fiche demanderait de choisir avant de rendre ses trois tomes lus.
  await db.userWork.create({
    data: {
      userId: admin.id,
      workId: W.berserk,
      editionId: BERSERK_EDITION,
      state: "IN_PROGRESS",
      currentRating: starsToScore(5),
      liked: true,
      startedAt: day("2024-05-01"),
      createdAt: day("2024-05-01"),
    },
  });

  // Progression : la première saison vue, les trois premiers tomes lus.
  const season1 = await db.episode.findMany({
    where: { seasonId: "fixtfrieren0s1" },
    select: { id: true },
    orderBy: { number: "asc" },
  });
  await db.episodeWatch.createMany({
    data: season1.map((e) => ({
      userId: admin.id,
      episodeId: e.id,
      watchedAt: day("2024-04-20"),
    })),
  });
  await db.tomeProgress.createMany({
    data: buildTomes(3).map((t) => ({
      userId: admin.id,
      tomeId: `fixtberserk0t${String(t.number).padStart(2, "0")}`,
      state: "READ" as const,
    })),
  });

  // ─── Le journal ───────────────────────────────────────────
  // `importKey: null` est obligatoire : le fil du lot 4 écarte tout ce qui
  // porte une clé d'import, sans quoi un import noierait le fil des abonnés.
  await db.journalEntry.createMany({
    data: [
      {
        userId: admin.id,
        workId: W.chihiro,
        loggedAt: day("2024-03-02"),
        datePrecision: "DAY" as const,
        rating: starsToScore(4.5),
        reviewText:
          "Revu vingt ans après : le train sur l'eau reste le plus beau plan du cinéma d'animation.",
        importKey: null,
        createdAt: day("2024-03-02"),
      },
      {
        userId: admin.id,
        workId: W.frieren,
        seasonId: "fixtfrieren0s1",
        loggedAt: day("2024-04-20"),
        datePrecision: "DAY" as const,
        rating: starsToScore(4),
        isSeasonBatch: true,
        importKey: null,
        createdAt: day("2024-04-20"),
      },
      {
        userId: admin.id,
        workId: W.berserk,
        tomeId: "fixtberserk0t03",
        loggedAt: day("2024-05-12"),
        datePrecision: "DAY" as const,
        reviewText: "L'Âge d'or, toujours aussi implacable.",
        importKey: null,
        createdAt: day("2024-05-12"),
      },
    ],
  });

  console.log(
    `✅ Fixtures : 3 œuvres, ${season1.length} épisodes vus, 3 tomes lus, 3 entrées de journal, invitation ${E2E_INVITE_CODE}`,
  );
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
