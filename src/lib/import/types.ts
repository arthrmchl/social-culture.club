/**
 * Types canoniques du pipeline d'import (lot 2).
 *
 * Un adaptateur ne fait qu'une chose : transformer des fichiers texte en une
 * liste d'`ImportedEvent`. Tout le reste — rapprochement, création de fiches,
 * journal, idempotence — est mutualisé et ignore la source.
 */

import type {
  DatePrecision,
  ImportRowKind,
  ImportSource,
  WorkStatusState,
  WorkType,
} from "@/generated/prisma/enums";

/** L'œuvre telle que la décrit la source, avant tout rapprochement. */
export type ImportedWorkRef = {
  /** Identifiant de la source — vit sur ImportTarget, jamais sur Work (D6). */
  externalId: string | null;
  type: WorkType;
  titleFr: string;
  titleOriginal: string | null;
  year: number | null;
  isbn: string | null;
  pageCount: number | null;
  creators: string[];
  /** Saison concernée (Serializd). */
  seasonNumber: number | null;
  /** Tome concerné (« Vol. 3 » détecté dans un titre Goodreads). */
  volumeNumber: number | null;
};

/** Un événement importé, indépendant de la source. */
export type ImportedEvent = {
  kind: ImportRowKind;
  work: ImportedWorkRef;

  loggedAt: Date | null;
  datePrecision: DatePrecision;

  rating: number | null; // sur 10, déjà converti
  liked: boolean;
  reviewText: string | null;
  reviewHasSpoiler: boolean;
  isRewatch: boolean;

  state: WorkStatusState | null;
  watchlistedAt: Date | null;

  currentPage: number | null;
  startedAt: Date | null;
  finishedAt: Date | null;

  context: string | null;

  sourceFile: string;
  sourceLine: number;
  /** Graine de la clé de dédoublonnage (voir dedup.ts). */
  seed: string;
};

export type ImportWarning = {
  level: "info" | "warning" | "error";
  file: string;
  line?: number;
  /** Message en français, affiché tel quel à l'utilisateur. */
  message: string;
};

export type ImportedFile = { name: string; content: string };

export type ParseResult = {
  events: ImportedEvent[];
  /** Fichiers conservés bruts pour plus tard (listes Letterboxd → lot 3). */
  retained: ImportedFile[];
  warnings: ImportWarning[];
};

/** Options d'analyse, modifiables dans l'UI sans toucher au code. */
export type ImportOptions = {
  /** watched.csv sans date de visionnage : entrée sans date, ou date d'ajout. */
  watchedDateFallback: "unknown" | "addedDate";
  importWatchlist: boolean;
  importLikes: boolean;
  importReviews: boolean;
  /** Détecter « Vol. 3 » / « Tome 3 » dans un titre de lecture. */
  detectVolumes: boolean;
  /** Type par défaut des séries importées (Serializd ne le dit pas). */
  seriesDefaultType: "SERIES" | "ANIME";
  /** Conserver les fichiers de listes pour le lot 3. */
  retainLists: boolean;
};

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  watchedDateFallback: "unknown",
  importWatchlist: true,
  importLikes: true,
  importReviews: true,
  detectVolumes: true,
  seriesDefaultType: "SERIES",
  retainLists: true,
};

export type SourceAdapter = {
  source: ImportSource;
  label: string;
  /** Consigne affichée à l'utilisateur sur l'écran de dépôt. */
  hint: string;
  /** Confiance que ces fichiers viennent de cette source (0 à 1). */
  detect(files: ImportedFile[]): number;
  parse(files: ImportedFile[], options: ImportOptions): ParseResult;
};

/** Événement vierge — les adaptateurs ne renseignent que ce qu'ils savent. */
export function emptyEvent(
  kind: ImportRowKind,
  work: ImportedWorkRef,
  sourceFile: string,
  sourceLine: number,
): ImportedEvent {
  return {
    kind,
    work,
    loggedAt: null,
    datePrecision: "UNKNOWN",
    rating: null,
    liked: false,
    reviewText: null,
    reviewHasSpoiler: false,
    isRewatch: false,
    state: null,
    watchlistedAt: null,
    currentPage: null,
    startedAt: null,
    finishedAt: null,
    context: null,
    sourceFile,
    sourceLine,
    seed: "",
  };
}

/** Référence d'œuvre vierge. */
export function emptyWorkRef(type: WorkType, titleFr: string): ImportedWorkRef {
  return {
    externalId: null,
    type,
    titleFr,
    titleOriginal: null,
    year: null,
    isbn: null,
    pageCount: null,
    creators: [],
    seasonNumber: null,
    volumeNumber: null,
  };
}
