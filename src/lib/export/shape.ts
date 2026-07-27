/**
 * Forme du document d'export (I4) — logique pure.
 *
 * Deux principes, dictés par N4 : le fichier doit être lisible **sans**
 * l'application, et rechargeable **dans** l'application. D'où des sous-unités
 * référencées par leur numéro plutôt que par un identifiant interne, et la
 * clé d'import conservée pour qu'un réimport reste idempotent.
 */

export const EXPORT_FORMAT = "social-culture.club";

/**
 * Version 2 (lot 3) : listes, étiquettes, favoris, citations, objectifs et
 * éditions. Le numéro change parce qu'un lecteur doit pouvoir distinguer
 * « pas de listes parce que l'utilisateur n'en a pas » de « pas de listes
 * parce que c'est un export d'avant le lot 3 ».
 */
export const EXPORT_VERSION = 2;

export type ExportedWork = {
  id: string;
  type: string;
  titleFr: string;
  titleOriginal: string | null;
  year: number | null;
  synopsis: string | null;
  durationMinutes: number | null;
  pageCount: number | null;
  isbn: string | null;
  needsCompletion: boolean;
  genres: string[];
  creators: { name: string; role: string | null }[];
  seasons: { number: number; title: string | null; episodes: number }[];
  tomes: { number: number; title: string | null; pageCount: number | null }[];
  /**
   * Éditions (D8) — désignées par leur libellé et leur ISBN, jamais par un
   * identifiant interne, comme les sous-unités le sont par leur numéro.
   */
  editions: {
    label: string;
    format: string | null;
    publisher: string | null;
    isbn: string | null;
    pageCount: number | null;
    isDefault: boolean;
    coversTomeFrom: number | null;
    coversTomeTo: number | null;
  }[];
  coverUrl: string | null;
};

export type ExportedDocument = {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  user: {
    id: string;
    name: string;
    username: string | null;
    email: string;
    bio: string | null;
    createdAt: string;
  };
  works: ExportedWork[];
  userWorks: unknown[];
  journalEntries: unknown[];
  userSeasons: unknown[];
  episodeWatches: unknown[];
  tomeProgress: unknown[];
  readingProgress: unknown[];
  imports: unknown[];
  // Bibliothèque riche (lot 3)
  lists: unknown[];
  tags: unknown[];
  favorites: unknown[];
  quotes: unknown[];
  goals: unknown[];
};

/** Nom de fichier d'un export : stable, daté, sans caractère problématique. */
export function exportFilename(
  username: string | null,
  extension: string,
  now: Date = new Date(),
): string {
  const who = (username ?? "export")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const day = now.toISOString().slice(0, 10);
  return `scc-${who || "export"}-${day}.${extension}`;
}

/** Entités exportables en CSV — l'ordre fixe celui de la page /donnees. */
export const CSV_ENTITIES = [
  "journal",
  "oeuvres",
  "suivi",
  "saisons",
  "episodes-vus",
  "tomes",
  "progression-lecture",
  "watchlist",
  // Bibliothèque riche (lot 3)
  "listes",
  "tags",
  "favoris",
  "citations",
  "objectifs",
  "editions",
] as const;

export type CsvEntity = (typeof CSV_ENTITIES)[number];

export function isCsvEntity(value: string): value is CsvEntity {
  return (CSV_ENTITIES as readonly string[]).includes(value);
}

export const ENTITY_LABELS: Record<CsvEntity, string> = {
  journal: "Journal",
  oeuvres: "Œuvres référencées",
  suivi: "Suivi (statuts, notes, j'aime)",
  saisons: "Notes et critiques de saisons",
  "episodes-vus": "Épisodes vus",
  tomes: "Tomes lus",
  "progression-lecture": "Progression de lecture",
  watchlist: "Liste d'envies",
  listes: "Listes et leurs éléments",
  tags: "Étiquettes",
  favoris: "Favoris de profil",
  citations: "Citations",
  objectifs: "Objectifs annuels",
  editions: "Éditions",
};
