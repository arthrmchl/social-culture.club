/**
 * Adaptateur Serializd (lot 2, I2) — logique pure.
 *
 * C'est la source la moins documentée des trois : les intitulés de colonnes et
 * l'échelle de notation restent à confirmer contre un vrai export (D14). Tout
 * ce qui est incertain est donc concentré dans les deux constantes ci-dessous,
 * et l'adaptateur dégrade au lieu d'échouer.
 *
 * Sans référentiel externe (D6), l'export ne fournit pas la liste des épisodes :
 * on crée la série et ses saisons, la progression à l'épisode reste à faire
 * dans l'application (générateurs de S2, « marquer comme vu jusqu'à »).
 */

import { parseCsv, toRecords } from "../csv";
import { resolveColumns, cell } from "../headers";
import {
  parseImportDate,
  parseHalfStarRating,
  parseIntegerRating,
  parseYear,
  parseCount,
  parseYesNo,
  htmlToText,
} from "../values";
import {
  emptyEvent,
  emptyWorkRef,
  type ImportedEvent,
  type ImportedWorkRef,
  type ImportOptions,
  type ImportWarning,
  type SourceAdapter,
} from "../types";

/** À valider contre un export réel — le seul endroit à corriger. */
const COLUMNS = {
  title: ["Show Title", "Show", "Series Title", "Title", "Name"],
  season: ["Season Number", "Season", "Season Num"],
  seasonTitle: ["Season Title", "Season Name"],
  year: ["Year", "First Air Date", "Release Year"],
  rating: ["Rating", "My Rating", "Score"],
  review: ["Review", "My Review", "Comment"],
  date: ["Date Watched", "Watched Date", "Date", "Log Date"],
  rewatch: ["Rewatch", "Is Rewatch"],
  status: ["Status", "Watch Status"],
} as const;

/**
 * Échelle de notation de Serializd — à valider. « half-star » couvre 0,5 à 5
 * par demi-point (comme Letterboxd), « ten » couvre 0 à 10.
 */
const RATING_SCALE: "half-star" | "ten" = "half-star";

export const serializdAdapter: SourceAdapter = {
  source: "SERIALIZD",
  label: "Serializd",
  hint: "Déposez le CSV d'export Serializd (journal des saisons vues). Le format de ce service est encore à confirmer : vérifiez le récapitulatif avant d'appliquer.",

  detect(files) {
    let score = 0;
    for (const f of files) {
      const head = f.content.slice(0, 2000).toLowerCase();
      if (head.includes("show title") || head.includes("show,")) score += 0.5;
      if (head.includes("season")) score += 0.3;
      if (f.name.toLowerCase().includes("serializd")) score += 0.4;
    }
    return Math.min(score, 1);
  },

  parse(files, options) {
    const warnings: ImportWarning[] = [];
    const events: ImportedEvent[] = [];

    warnings.push({
      level: "info",
      file: "—",
      message:
        "Serializd ne fournit pas la liste des épisodes : les séries et leurs saisons sont créées, la progression à l'épisode reste à compléter dans l'application.",
    });

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
            "Colonne de titre de série introuvable : ce fichier ne ressemble pas à un export Serializd.",
        });
        continue;
      }
      if (map.date === null) {
        warnings.push({
          level: "warning",
          file: file.name,
          message:
            "Colonne de date introuvable : les entrées de journal seront créées sans date.",
        });
      }
      if (map.season === null) {
        warnings.push({
          level: "warning",
          file: file.name,
          message:
            "Colonne de saison introuvable : les entrées seront rattachées à la série, sans saison.",
        });
      }

      toRecords(table).forEach((rec, idx) => {
        const line = idx + 2;
        const titleFr = cell(rec, map, "title");
        if (!titleFr) return;

        const ref = showRef(rec, map, titleFr, options);
        const seasonPart =
          ref.seasonNumber === null ? "serie" : `S${ref.seasonNumber}`;
        const rawDate = cell(rec, map, "date");
        const { date, precision } = parseImportDate(rawDate);

        const event = emptyEvent("LOG", ref, file.name, line);
        event.loggedAt = date;
        event.datePrecision = precision;
        event.rating = rating(cell(rec, map, "rating"));
        event.reviewText = htmlToText(cell(rec, map, "review")) || null;
        event.isRewatch = parseYesNo(cell(rec, map, "rewatch"));
        event.seed = `${titleFr}|${seasonPart}|${rawDate || "sans-date"}`;

        events.push(event);
      });
    }

    if (events.length === 0) {
      warnings.push({
        level: "error",
        file: "—",
        message:
          "Aucune donnée exploitable : vérifiez que le fichier déposé est bien un export Serializd.",
      });
    }

    return { events, retained: [], warnings };
  },
};

function rating(raw: string): number | null {
  return RATING_SCALE === "half-star"
    ? parseHalfStarRating(raw)
    : parseIntegerRating(raw, 10);
}

function showRef(
  rec: Record<string, string>,
  map: Record<keyof typeof COLUMNS, string | null>,
  titleFr: string,
  options: ImportOptions,
): ImportedWorkRef {
  const ref = emptyWorkRef(options.seriesDefaultType, titleFr);
  ref.year = parseYear(cell(rec, map, "year"));
  ref.seasonNumber = parseCount(cell(rec, map, "season"));
  return ref;
}
