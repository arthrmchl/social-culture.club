/**
 * Adaptateur Letterboxd (lot 2, I1) — logique pure.
 *
 * L'export officiel est un ensemble de CSV qui se recoupent : un même film
 * apparaît dans `watched.csv`, `diary.csv`, `ratings.csv` et `reviews.csv`.
 * La règle de fusion ci-dessous est ce qui empêche de créer quatre entrées de
 * journal pour un seul visionnage.
 *
 * Toutes les colonnes utilisées sont documentées et stables, sauf indication
 * « à valider » — auquel cas l'absence produit un avertissement, jamais une
 * erreur (R5).
 */

import { parseCsv, toRecords, detectHeaderLine } from "../csv";
import { resolveColumns, cell } from "../headers";
import {
  parseImportDate,
  parseHalfStarRating,
  parseYear,
  parseYesNo,
  splitTags,
} from "../values";
import { letterboxdSlug } from "../infer";
import { parseLetterboxdLists } from "./letterboxd-lists";
import {
  emptyEvent,
  emptyWorkRef,
  type ImportedEvent,
  type ImportedFile,
  type ImportWarning,
  type SourceAdapter,
} from "../types";

/** Alias de colonnes — le seul endroit à corriger si l'export change. */
const COLUMNS = {
  date: ["Date"],
  name: ["Name"],
  year: ["Year"],
  uri: ["Letterboxd URI"],
  rating: ["Rating"],
  rewatch: ["Rewatch"],
  tags: ["Tags"],
  watchedDate: ["Watched Date"],
  review: ["Review"],
  spoilers: ["Contains Spoilers", "Spoilers"], // à valider
  position: ["Position"],
  description: ["Description"],
} as const;

const FILM_FILES = new Set([
  "watched.csv",
  "diary.csv",
  "ratings.csv",
  "reviews.csv",
  "watchlist.csv",
]);

/** Un film tel que décrit par une ligne, indépendamment du fichier. */
type FilmRef = {
  externalId: string | null;
  titleFr: string;
  year: number | null;
};

export const letterboxdAdapter: SourceAdapter = {
  source: "LETTERBOXD",
  label: "Letterboxd",
  hint: "Déposez les CSV de l'export Letterboxd (diary, watched, ratings, reviews, watchlist, listes…). Dézippez l'archive au préalable.",

  detect(files) {
    const names = files.map((f) => baseName(f.name));
    let score = 0;
    if (names.includes("diary.csv")) score += 0.5;
    if (names.includes("watched.csv")) score += 0.3;
    if (names.includes("watchlist.csv")) score += 0.1;
    if (files.some((f) => f.content.includes("Letterboxd URI"))) score += 0.4;
    return Math.min(score, 1);
  },

  parse(files, options) {
    const warnings: ImportWarning[] = [];
    const events: ImportedEvent[] = [];
    const retained: ImportedFile[] = [];

    /** Visionnages déjà consignés, par (film, date) — base de la fusion. */
    const logged = new Map<string, ImportedEvent>();

    const find = (name: string) =>
      files.find((f) => baseName(f.name) === name) ?? null;

    // 1. diary.csv fait autorité pour les entrées de journal.
    const diary = find("diary.csv");
    if (diary) {
      for (const { rec, line, map } of rowsOf(diary, warnings, ["name"])) {
        const film = filmRef(rec, map);
        if (!film) continue;

        const { date, precision } = parseImportDate(
          cell(rec, map, "watchedDate"),
        );
        const fallback =
          date === null && options.watchedDateFallback === "addedDate"
            ? parseImportDate(cell(rec, map, "date"))
            : null;

        const event = emptyEvent("LOG", workRef(film), diary.name, line);
        event.loggedAt = date ?? fallback?.date ?? null;
        event.datePrecision = date
          ? precision
          : (fallback?.precision ?? "UNKNOWN");
        event.rating = parseHalfStarRating(cell(rec, map, "rating"));
        event.isRewatch = parseYesNo(cell(rec, map, "rewatch"));
        // Les étiquettes ont enfin un modèle (lot 3, S10) : elles y vont.
        // Sans reprise des tags, on garde le repli du lot 2 — les verser dans
        // le contexte — pour ne pas perdre l'information.
        if (options.importTags) {
          event.tags = splitTags(cell(rec, map, "tags"));
        } else {
          event.context = tagsToContext(cell(rec, map, "tags"));
        }
        event.seed = `${film.externalId ?? film.titleFr}|${cell(rec, map, "watchedDate") || "sans-date"}`;

        events.push(event);
        logged.set(mergeKey(film, cell(rec, map, "watchedDate")), event);
      }
    }

    // 2. reviews.csv est fusionné dans le journal par (film, date de visionnage).
    const reviews = options.importReviews ? find("reviews.csv") : null;
    if (reviews) {
      for (const { rec, line, map } of rowsOf(reviews, warnings, ["name"])) {
        const film = filmRef(rec, map);
        if (!film) continue;

        const watchedDate = cell(rec, map, "watchedDate");
        const text = cell(rec, map, "review");
        if (!text) continue;

        const existing = logged.get(mergeKey(film, watchedDate));
        if (existing) {
          existing.reviewText = text;
          existing.reviewHasSpoiler = parseYesNo(cell(rec, map, "spoilers"));
          continue;
        }

        // Critique sans visionnage correspondant : elle vaut une entrée.
        const { date, precision } = parseImportDate(watchedDate);
        const event = emptyEvent("LOG", workRef(film), reviews.name, line);
        event.loggedAt = date;
        event.datePrecision = precision;
        event.rating = parseHalfStarRating(cell(rec, map, "rating"));
        event.isRewatch = parseYesNo(cell(rec, map, "rewatch"));
        event.reviewText = text;
        event.reviewHasSpoiler = parseYesNo(cell(rec, map, "spoilers"));
        event.seed = `${film.externalId ?? film.titleFr}|${watchedDate || "sans-date"}`;

        events.push(event);
        logged.set(mergeKey(film, watchedDate), event);
      }
    }

    // 3. watched.csv ne complète que les films absents du journal.
    const watched = find("watched.csv");
    if (watched) {
      const seenFilms = new Set(
        events.map((e) => e.work.externalId ?? e.work.titleFr),
      );
      for (const { rec, line, map } of rowsOf(watched, warnings, ["name"])) {
        const film = filmRef(rec, map);
        if (!film) continue;
        if (seenFilms.has(film.externalId ?? film.titleFr)) continue;

        const added = parseImportDate(cell(rec, map, "date"));
        const useAdded = options.watchedDateFallback === "addedDate";

        const event = emptyEvent("LOG", workRef(film), watched.name, line);
        event.loggedAt = useAdded ? added.date : null;
        event.datePrecision = useAdded ? added.precision : "UNKNOWN";
        event.seed = `${film.externalId ?? film.titleFr}|watched`;

        events.push(event);
      }
    }

    // 4. ratings.csv alimente la note actuelle, jamais le journal.
    const ratings = find("ratings.csv");
    if (ratings) {
      for (const { rec, line, map } of rowsOf(ratings, warnings, ["name"])) {
        const film = filmRef(rec, map);
        if (!film) continue;
        const rating = parseHalfStarRating(cell(rec, map, "rating"));
        if (rating === null) continue;

        const event = emptyEvent("RATING", workRef(film), ratings.name, line);
        event.rating = rating;
        event.seed = `${film.externalId ?? film.titleFr}|rating`;
        events.push(event);
      }
    }

    // 5. likes/films.csv → j'aime (S6).
    const likes = options.importLikes
      ? files.find((f) => normalizePath(f.name).endsWith("likes/films.csv"))
      : undefined;
    if (likes) {
      for (const { rec, line, map } of rowsOf(likes, warnings, ["name"])) {
        const film = filmRef(rec, map);
        if (!film) continue;
        const event = emptyEvent("LIKE", workRef(film), likes.name, line);
        event.liked = true;
        event.seed = `${film.externalId ?? film.titleFr}|like`;
        events.push(event);
      }
    }

    // 6. watchlist.csv → envie de voir (F1). Un film déjà vu garde son statut :
    //    on note la date d'ajout sans forcer l'état (voir apply.ts).
    const watchlist = options.importWatchlist ? find("watchlist.csv") : null;
    if (watchlist) {
      for (const { rec, line, map } of rowsOf(watchlist, warnings, ["name"])) {
        const film = filmRef(rec, map);
        if (!film) continue;

        const added = parseImportDate(cell(rec, map, "date"));
        const event = emptyEvent(
          "WATCHLIST",
          workRef(film),
          watchlist.name,
          line,
        );
        event.state = "WANT";
        event.watchlistedAt = added.date;
        event.seed = `${film.externalId ?? film.titleFr}|watchlist`;
        events.push(event);
      }
    }

    // 7. Listes (S9) — reprises depuis le lot 3.
    //
    //    Chaque élément devient un événement `LIST_ITEM` : il désigne un film
    //    par le même slug Letterboxd que le diary, donc il traverse
    //    `groupIntoTargets`, le rapprochement pg_trgm et l'écran de
    //    rapprochement sans une ligne de code nouvelle. C'est tout l'intérêt
    //    d'avoir conservé ces fichiers bruts au lot 2.
    const lists = files.filter((f) => normalizePath(f.name).includes("lists/"));
    if (lists.length > 0) {
      if (!options.importLists || options.retainLists) {
        retained.push(...lists);
        warnings.push({
          level: "info",
          file: `${lists.length} fichier(s) de listes`,
          message:
            "Les listes sont conservées telles quelles : vous pourrez les reprendre plus tard depuis la page du lot.",
        });
      } else {
        const parsed = parseLetterboxdLists(lists);
        warnings.push(...parsed.warnings);

        for (const list of parsed.lists) {
          for (const item of list.items) {
            const film: FilmRef = {
              externalId: item.externalId,
              titleFr: item.titleFr,
              year: item.year,
            };
            const event = emptyEvent(
              "LIST_ITEM",
              workRef(film),
              list.sourceFile,
              item.line,
            );
            event.list = {
              // La clé d'import de la liste : stable, indépendante du lot.
              key: `letterboxd:list:${list.slug}`,
              name: list.name,
              description: list.description,
              position: item.position,
              note: item.note,
              isRanked: list.isRanked,
              createdAt: list.createdAt,
            };
            event.seed = `${film.externalId ?? film.titleFr}|list:${list.slug}`;
            events.push(event);
          }
        }
      }
    }

    // Fichiers non exploités (profile.csv, comments.csv…) : on le dit.
    for (const f of files) {
      const n = normalizePath(f.name);
      if (FILM_FILES.has(baseName(f.name))) continue;
      if (n.includes("lists/") || n.endsWith("likes/films.csv")) continue;
      warnings.push({
        level: "info",
        file: f.name,
        message: "Fichier non exploité par l'import Letterboxd.",
      });
    }

    if (events.length === 0) {
      warnings.push({
        level: "error",
        file: "—",
        message:
          "Aucune donnée exploitable : vérifiez que les fichiers déposés viennent bien d'un export Letterboxd.",
      });
    }

    return { events, retained, warnings };
  },
};

// ─── Utilitaires locaux ──────────────────────────────────────

function baseName(name: string): string {
  return normalizePath(name).split("/").pop() ?? name;
}

function normalizePath(name: string): string {
  return name.replace(/\\/g, "/").toLowerCase();
}

/** Clé de fusion entre diary et reviews : le film et la date de visionnage. */
function mergeKey(film: FilmRef, watchedDate: string): string {
  return `${film.externalId ?? film.titleFr}|${watchedDate}`;
}

function filmRef(
  rec: Record<string, string>,
  map: Record<keyof typeof COLUMNS, string | null>,
): FilmRef | null {
  const titleFr = cell(rec, map, "name");
  if (!titleFr) return null;
  return {
    externalId: letterboxdSlug(cell(rec, map, "uri")),
    titleFr,
    year: parseYear(cell(rec, map, "year")),
  };
}

function workRef(film: FilmRef) {
  const ref = emptyWorkRef("FILM", film.titleFr);
  ref.externalId = film.externalId;
  ref.year = film.year;
  return ref;
}

function tagsToContext(raw: string): string | null {
  const tags = splitTags(raw);
  return tags.length > 0 ? tags.join(", ") : null;
}

/**
 * Lit un fichier et rend ses lignes résolues. Signale une colonne obligatoire
 * absente sans interrompre l'import.
 */
function rowsOf(
  file: ImportedFile,
  warnings: ImportWarning[],
  required: (keyof typeof COLUMNS)[],
): {
  rec: Record<string, string>;
  line: number;
  map: Record<keyof typeof COLUMNS, string | null>;
}[] {
  const skip = Math.max(detectHeaderLine(file.content, ["Name"]), 0);
  const table = parseCsv(file.content, { skipLines: skip });
  if (table.headers.length === 0) {
    warnings.push({
      level: "warning",
      file: file.name,
      message: "Fichier vide ou illisible.",
    });
    return [];
  }

  const { map, missing } = resolveColumns(table.headers, COLUMNS, required);
  for (const key of missing) {
    warnings.push({
      level: "warning",
      file: file.name,
      message: `Colonne « ${key} » introuvable : les lignes de ce fichier seront ignorées.`,
    });
  }
  if (missing.length > 0) return [];

  return toRecords(table).map((rec, idx) => ({
    rec,
    line: skip + idx + 2, // +1 en-tête, +1 pour compter à partir de 1
    map,
  }));
}
