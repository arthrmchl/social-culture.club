import "server-only";
import { db } from "@/lib/db";
import { scoreToStars } from "@/lib/rating";
import { toCsv, type CsvColumn } from "./csv";
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  type CsvEntity,
  type ExportedDocument,
} from "./shape";

/** Lecture par pages : on ne charge jamais un journal entier en mémoire. */
const PAGE = 500;

/**
 * Export complet des données d'un utilisateur (I4, N9).
 *
 * Le périmètre est volontairement personnel : le suivi de l'utilisateur, plus
 * les fiches d'œuvres qu'il référence — sans ce dictionnaire, le fichier
 * serait illisible. Le catalogue entier relève de la sauvegarde (I5).
 */
export async function collectUserExport(
  userId: string,
): Promise<ExportedDocument> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

  const [userWorks, entries, userSeasons, watches, tomes, reading, imports] =
    await Promise.all([
      db.userWork.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      db.journalEntry.findMany({
        where: { userId },
        orderBy: [{ loggedAt: "asc" }, { createdAt: "asc" }],
        include: {
          season: { select: { number: true } },
          episode: {
            select: { number: true, season: { select: { number: true } } },
          },
          tome: { select: { number: true } },
        },
      }),
      db.userSeason.findMany({
        where: { userId },
        include: {
          season: {
            select: { number: true, workId: true },
          },
        },
      }),
      db.episodeWatch.findMany({
        where: { userId },
        include: {
          episode: {
            select: {
              number: true,
              season: { select: { number: true, workId: true } },
            },
          },
        },
      }),
      db.tomeProgress.findMany({
        where: { userId },
        include: { tome: { select: { number: true, workId: true } } },
      }),
      db.readingProgress.findMany({
        where: { userId },
        orderBy: { recordedAt: "asc" },
      }),
      db.importBatch.findMany({
        where: { userId },
        select: {
          id: true,
          source: true,
          status: true,
          createdAt: true,
          files: { select: { name: true, checksum: true, bytes: true } },
        },
      }),
    ]);

  // Toutes les œuvres référencées, quelle que soit la voie.
  const workIds = new Set<string>([
    ...userWorks.map((u) => u.workId),
    ...entries.map((e) => e.workId),
    ...reading.map((r) => r.workId),
    ...userSeasons.map((s) => s.season.workId),
    ...watches.map((w) => w.episode.season.workId),
    ...tomes.map((t) => t.tome.workId),
  ]);

  const works = await collectWorks([...workIds]);

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      bio: user.bio,
      createdAt: user.createdAt.toISOString(),
    },
    works,
    userWorks: userWorks.map((u) => ({
      workId: u.workId,
      state: u.state,
      currentRating: u.currentRating,
      currentStars: u.currentRating ? scoreToStars(u.currentRating) : null,
      liked: u.liked,
      reviewText: u.reviewText,
      reviewHasSpoiler: u.reviewHasSpoiler,
      reviewedAt: iso(u.reviewedAt),
      currentPage: u.currentPage,
      progressPercent: u.progressPercent,
      startedAt: iso(u.startedAt),
      finishedAt: iso(u.finishedAt),
      viewings: u.rewatchCount,
      watchlistedAt: iso(u.watchlistedAt),
    })),
    journalEntries: entries.map((e) => ({
      workId: e.workId,
      // Sous-unités par numéro : lisible hors de l'application, et
      // rechargeable sans dépendre d'identifiants internes.
      seasonNumber: e.season?.number ?? e.episode?.season.number ?? null,
      episodeNumber: e.episode?.number ?? null,
      tomeNumber: e.tome?.number ?? null,
      loggedAt: iso(e.loggedAt),
      datePrecision: e.datePrecision,
      rating: e.rating,
      stars: e.rating ? scoreToStars(e.rating) : null,
      reviewText: e.reviewText,
      reviewHasSpoiler: e.reviewHasSpoiler,
      isRewatch: e.isRewatch,
      context: e.context,
      isSeasonBatch: e.isSeasonBatch,
      importKey: e.importKey,
    })),
    userSeasons: userSeasons.map((s) => ({
      workId: s.season.workId,
      seasonNumber: s.season.number,
      rating: s.rating,
      stars: s.rating ? scoreToStars(s.rating) : null,
      reviewText: s.reviewText,
      reviewHasSpoiler: s.reviewHasSpoiler,
    })),
    episodeWatches: watches.map((w) => ({
      workId: w.episode.season.workId,
      seasonNumber: w.episode.season.number,
      episodeNumber: w.episode.number,
      watchedAt: iso(w.watchedAt),
    })),
    tomeProgress: tomes.map((t) => ({
      workId: t.tome.workId,
      tomeNumber: t.tome.number,
      state: t.state,
    })),
    readingProgress: reading.map((r) => ({
      workId: r.workId,
      page: r.page,
      percent: r.percent,
      recordedAt: r.recordedAt.toISOString(),
    })),
    imports: imports.map((b) => ({
      id: b.id,
      source: b.source,
      status: b.status,
      createdAt: b.createdAt.toISOString(),
      files: b.files,
    })),
  };
}

/** Fiches d'œuvres, lues par pages. */
async function collectWorks(ids: string[]) {
  const out: ExportedDocument["works"] = [];

  for (let i = 0; i < ids.length; i += PAGE) {
    const works = await db.work.findMany({
      where: { id: { in: ids.slice(i, i + PAGE) } },
      orderBy: { titleNormalized: "asc" },
      include: {
        genres: { include: { genre: { select: { name: true } } } },
        creators: { include: { person: { select: { name: true } } } },
        seasons: {
          orderBy: { number: "asc" },
          include: { _count: { select: { episodes: true } } },
        },
        tomes: { orderBy: { number: "asc" } },
      },
    });

    for (const w of works) {
      out.push({
        id: w.id,
        type: w.type,
        titleFr: w.titleFr,
        titleOriginal: w.titleOriginal,
        year: w.year,
        synopsis: w.synopsis,
        durationMinutes: w.durationMinutes,
        pageCount: w.pageCount,
        isbn: w.isbn,
        needsCompletion: w.needsCompletion,
        genres: w.genres.map((g) => g.genre.name),
        creators: w.creators.map((c) => ({ name: c.person.name, role: c.role })),
        seasons: w.seasons.map((s) => ({
          number: s.number,
          title: s.title,
          episodes: s._count.episodes,
        })),
        tomes: w.tomes.map((t) => ({
          number: t.number,
          title: t.title,
          pageCount: t.pageCount,
        })),
        coverUrl: w.coverImageId ? `/api/uploads/${w.coverImageId}` : null,
      });
    }
  }

  return out;
}

/** Une entité au format CSV, à partir du même document que le JSON. */
export function entityToCsv(doc: ExportedDocument, entity: CsvEntity): string {
  const titles = new Map(doc.works.map((w) => [w.id, w.titleFr]));
  const titre = (row: { workId: string }) => titles.get(row.workId) ?? "";

  switch (entity) {
    case "journal":
      return toCsv(doc.journalEntries as JournalRow[], [
        col("Œuvre", titre),
        col("Identifiant œuvre", (r) => r.workId),
        col("Date", (r) => r.loggedAt),
        col("Précision", (r) => r.datePrecision),
        col("Saison", (r) => r.seasonNumber),
        col("Épisode", (r) => r.episodeNumber),
        col("Tome", (r) => r.tomeNumber),
        col("Note sur 5", (r) => r.stars),
        col("Note sur 10", (r) => r.rating),
        col("Critique", (r) => r.reviewText),
        col("Spoiler", (r) => r.reviewHasSpoiler),
        col("Revisionnage", (r) => r.isRewatch),
        col("Contexte", (r) => r.context),
      ]);

    case "oeuvres":
      return toCsv(doc.works, [
        col("Identifiant", (w) => w.id),
        col("Type", (w) => w.type),
        col("Titre", (w) => w.titleFr),
        col("Titre original", (w) => w.titleOriginal),
        col("Année", (w) => w.year),
        col("Créateurs", (w) => w.creators.map((c) => c.name).join(" ; ")),
        col("Genres", (w) => w.genres.join(" ; ")),
        col("Durée (min)", (w) => w.durationMinutes),
        col("Pages", (w) => w.pageCount),
        col("ISBN", (w) => w.isbn),
        col("À compléter", (w) => w.needsCompletion),
      ]);

    case "suivi":
      return toCsv(doc.userWorks as UserWorkRow[], [
        col("Œuvre", titre),
        col("Identifiant œuvre", (r) => r.workId),
        col("Statut", (r) => r.state),
        col("Note sur 5", (r) => r.currentStars),
        col("J'aime", (r) => r.liked),
        col("Critique", (r) => r.reviewText),
        col("Commencé le", (r) => r.startedAt),
        col("Terminé le", (r) => r.finishedAt),
        col("Consommations", (r) => r.viewings),
        col("Page courante", (r) => r.currentPage),
      ]);

    case "saisons":
      return toCsv(doc.userSeasons as SeasonRow[], [
        col("Œuvre", titre),
        col("Saison", (r) => r.seasonNumber),
        col("Note sur 5", (r) => r.stars),
        col("Critique", (r) => r.reviewText),
      ]);

    case "episodes-vus":
      return toCsv(doc.episodeWatches as WatchRow[], [
        col("Œuvre", titre),
        col("Saison", (r) => r.seasonNumber),
        col("Épisode", (r) => r.episodeNumber),
        col("Vu le", (r) => r.watchedAt),
      ]);

    case "tomes":
      return toCsv(doc.tomeProgress as TomeRow[], [
        col("Œuvre", titre),
        col("Tome", (r) => r.tomeNumber),
        col("État", (r) => r.state),
      ]);

    case "progression-lecture":
      return toCsv(doc.readingProgress as ReadingRow[], [
        col("Œuvre", titre),
        col("Page", (r) => r.page),
        col("Pourcentage", (r) => r.percent),
        col("Relevé le", (r) => r.recordedAt),
      ]);

    case "watchlist":
      return toCsv(
        (doc.userWorks as UserWorkRow[]).filter((u) => u.watchlistedAt !== null),
        [
          col("Œuvre", titre),
          col("Identifiant œuvre", (r) => r.workId),
          col("Ajouté le", (r) => r.watchlistedAt),
        ],
      );
  }
}

// Types de lecture des lignes du document (le document lui-même reste
// volontairement lâche : c'est un format de sortie, pas un modèle interne).
type JournalRow = {
  workId: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
  tomeNumber: number | null;
  loggedAt: string | null;
  datePrecision: string;
  rating: number | null;
  stars: number | null;
  reviewText: string | null;
  reviewHasSpoiler: boolean;
  isRewatch: boolean;
  context: string | null;
};
type UserWorkRow = {
  workId: string;
  state: string | null;
  currentStars: number | null;
  liked: boolean;
  reviewText: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  viewings: number;
  currentPage: number | null;
  watchlistedAt: string | null;
};
type SeasonRow = {
  workId: string;
  seasonNumber: number;
  stars: number | null;
  reviewText: string | null;
};
type WatchRow = {
  workId: string;
  seasonNumber: number;
  episodeNumber: number;
  watchedAt: string | null;
};
type TomeRow = { workId: string; tomeNumber: number; state: string };
type ReadingRow = {
  workId: string;
  page: number | null;
  percent: number | null;
  recordedAt: string;
};

function col<T>(header: string, value: CsvColumn<T>["value"]): CsvColumn<T> {
  return { header, value };
}

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}
