/**
 * Adaptateur lectures (lot 2, I3) — logique pure.
 *
 * Couvre le CSV Goodreads, qui sert de pivot, et literal.club qui revendique
 * la compatibilité Goodreads : une seule table d'alias absorbe les deux, avec
 * les noms de colonnes et les valeurs d'état des deux services.
 */

import { parseCsv, toRecords } from "../csv";
import { resolveColumns, cell } from "../headers";
import {
  parseImportDate,
  parseIntegerRating,
  parseYear,
  parseCount,
  parseYesNo,
  cleanIsbn,
  htmlToText,
  splitTags,
} from "../values";
import { detectVolume, inferReadingType, inferReadingState } from "../infer";
import {
  emptyEvent,
  emptyWorkRef,
  type ImportedEvent,
  type ImportedFile,
  type ImportedWorkRef,
  type ImportOptions,
  type ImportWarning,
  type SourceAdapter,
} from "../types";

/**
 * Alias de colonnes — Goodreads d'abord, literal.club ensuite. C'est le seul
 * endroit à corriger quand un export réel révèle un autre intitulé.
 */
const COLUMNS = {
  id: ["Book Id", "id"],
  title: ["Title", "title"],
  author: ["Author", "author", "Primary Author"],
  additionalAuthors: ["Additional Authors", "authors"],
  isbn: ["ISBN13", "ISBN", "isbn13", "isbn"],
  pageCount: ["Number of Pages", "pageCount", "pages"],
  yearOriginal: ["Original Publication Year", "originalPublicationYear"],
  yearPublished: ["Year Published", "publishedDate", "publishedYear"],
  rating: ["My Rating", "rating"],
  shelf: ["Exclusive Shelf", "status", "readingStatus"],
  shelves: ["Bookshelves", "shelves", "tags"],
  dateRead: ["Date Read", "readingFinishedAt", "finishedAt", "dateFinished"],
  dateStarted: ["readingStartedAt", "startedAt", "dateStarted"],
  dateAdded: ["Date Added", "createdAt", "dateAdded"],
  review: ["My Review", "review", "notes"],
  spoiler: ["Spoiler", "hasSpoilers"], // à valider : absent des exports anciens
  readCount: ["Read Count", "readCount"],
  publisher: ["Publisher", "publisher"],
} as const;

/** Échelle de notation des deux services : entiers de 0 à 5. */
const RATING_SCALE = 5 as const;

export const goodreadsAdapter: SourceAdapter = {
  source: "GOODREADS",
  label: "Lectures (Goodreads, literal.club)",
  hint: "Déposez le CSV d'export Goodreads (goodreads_library_export.csv) ou l'export literal.club, qui suit le même format.",

  detect(files) {
    let score = 0;
    for (const f of files) {
      const head = f.content.slice(0, 2000);
      if (head.includes("Exclusive Shelf")) score += 0.6;
      if (head.includes("Book Id")) score += 0.3;
      if (/readingStatus|readingFinishedAt/i.test(head)) score += 0.6;
      if (/\bbookshelves\b/i.test(head)) score += 0.1;
    }
    return Math.min(score, 1);
  },

  parse(files, options) {
    const warnings: ImportWarning[] = [];
    const events: ImportedEvent[] = [];

    for (const file of files) {
      const table = parseCsv(file.content);
      if (table.headers.length === 0) {
        warnings.push({
          level: "warning",
          file: file.name,
          message: "Fichier vide ou illisible.",
        });
        continue;
      }

      const { map, missing } = resolveColumns(table.headers, COLUMNS, ["title"]);
      if (missing.length > 0) {
        warnings.push({
          level: "warning",
          file: file.name,
          message:
            "Colonne de titre introuvable : ce fichier ne ressemble pas à un export de lectures.",
        });
        continue;
      }
      if (map.shelf === null) {
        warnings.push({
          level: "warning",
          file: file.name,
          message:
            "Colonne d'état de lecture introuvable : les statuts (lu, en cours, à lire) ne seront pas repris.",
        });
      }

      toRecords(table).forEach((rec, idx) => {
        const line = idx + 2;
        events.push(...eventsForBook(rec, map, file, line, options));
      });
    }

    if (events.length === 0) {
      warnings.push({
        level: "error",
        file: "—",
        message:
          "Aucune lecture exploitable : vérifiez que le fichier déposé est bien un export Goodreads ou literal.club.",
      });
    }

    return { events, retained: [], warnings };
  },
};

type ColumnMap = Record<keyof typeof COLUMNS, string | null>;

function eventsForBook(
  rec: Record<string, string>,
  map: ColumnMap,
  file: ImportedFile,
  line: number,
  options: ImportOptions,
): ImportedEvent[] {
  const rawTitle = cell(rec, map, "title");
  if (!rawTitle) return [];

  const ref = bookRef(rec, map, rawTitle, options);
  const seedBase = ref.externalId ?? ref.isbn ?? ref.titleFr;

  const state = inferReadingState(cell(rec, map, "shelf"));
  const rating = parseIntegerRating(cell(rec, map, "rating"), RATING_SCALE);
  const review = htmlToText(cell(rec, map, "review"));
  const shelves = splitTags(cell(rec, map, "shelves"));
  const context = shelves.length > 0 ? shelves.join(", ") : null;

  const finished = parseImportDate(cell(rec, map, "dateRead"));
  const started = parseImportDate(cell(rec, map, "dateStarted"));
  const added = parseImportDate(cell(rec, map, "dateAdded"));

  const events: ImportedEvent[] = [];

  // Statut, note et dates de lecture : un seul événement de synthèse.
  const status = emptyEvent("STATE", ref, file.name, line);
  status.state = state;
  status.rating = rating;
  status.startedAt = started.date;
  status.finishedAt = state === "COMPLETED" ? finished.date : null;
  status.watchlistedAt = state === "WANT" ? added.date : null;
  status.context = context;
  status.seed = `${seedBase}|state`;
  events.push(status);

  // Lectures : une entrée de journal par lecture (L1, relectures comprises).
  if (state === "COMPLETED") {
    const readCount = Math.max(parseCount(cell(rec, map, "readCount")) ?? 1, 1);

    for (let n = 1; n <= readCount; n += 1) {
      const premiere = n === 1;
      const log = emptyEvent("LOG", ref, file.name, line);
      // Seule la dernière lecture est datée par l'export : les précédentes
      // existent sans date plutôt que d'inventer un calendrier.
      log.loggedAt = premiere ? finished.date : null;
      log.datePrecision = premiere ? finished.precision : "UNKNOWN";
      log.rating = premiere ? rating : null;
      log.reviewText = premiere && review ? review : null;
      log.reviewHasSpoiler = premiere && parseYesNo(cell(rec, map, "spoiler"));
      log.isRewatch = !premiere;
      log.context = context;
      log.seed = `${seedBase}|read|${n}`;
      events.push(log);
    }
  } else if (review) {
    // Critique sans lecture terminée : rattachée à l'œuvre (S7).
    const critique = emptyEvent("REVIEW", ref, file.name, line);
    critique.reviewText = review;
    critique.reviewHasSpoiler = parseYesNo(cell(rec, map, "spoiler"));
    critique.seed = `${seedBase}|review`;
    events.push(critique);
  }

  return events;
}

function bookRef(
  rec: Record<string, string>,
  map: ColumnMap,
  rawTitle: string,
  options: ImportOptions,
): ImportedWorkRef {
  const detected = options.detectVolumes
    ? detectVolume(rawTitle)
    : { title: rawTitle.trim(), volume: null };

  const ref = emptyWorkRef(inferReadingType(detected.volume), detected.title);

  const id = cell(rec, map, "id");
  ref.externalId = id ? `goodreads:${id}` : null;
  ref.volumeNumber = detected.volume;
  ref.isbn = cleanIsbn(cell(rec, map, "isbn"));
  ref.pageCount = parseCount(cell(rec, map, "pageCount"));
  ref.year =
    parseYear(cell(rec, map, "yearOriginal")) ??
    parseYear(cell(rec, map, "yearPublished"));

  ref.creators = [
    ...new Set(
      [
        cell(rec, map, "author"),
        ...splitTags(cell(rec, map, "additionalAuthors")),
      ].filter(Boolean),
    ),
  ];

  return ref;
}
