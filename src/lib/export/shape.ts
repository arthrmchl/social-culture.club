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
 * Version 2 (lot 3) : listes, étiquettes, favoris, objectifs et éditions. Le numéro change parce qu'un lecteur doit pouvoir distinguer
 * « pas de listes parce que l'utilisateur n'en a pas » de « pas de listes
 * parce que c'est un export d'avant le lot 3 ».
 *
 * Version 3 (lot 4) : réglages de visibilité, abonnements, j'aime sociaux,
 * commentaires et blocages. N4 exige que le membre reparte avec **tout** ce
 * qu'il a produit — un commentaire est un écrit au même titre qu'une critique.
 * Ce qui n'est pas exporté l'est délibérément : les notifications (dérivées des
 * gestes d'autrui) et les signalements (qui parlent d'un tiers).
 *
 * Version 4 (lot 5) : l'œuvre et l'édition sont enfin distinguées. `pageCount`
 * et `isbn` quittent l'œuvre pour l'édition, qui gagne titre, langue et
 * traducteurs ; l'œuvre gagne sa langue originale. Sans changement de version,
 * un lecteur ne saurait pas si un livre sans ISBN vient d'un export antérieur
 * ou d'une fiche sans édition décrite.
 *
 * Version 5 : les citations sont retirées de l'application. L'entité disparaît
 * du document plutôt que d'y rester vide — et la version le dit, sans quoi un
 * export récent serait indiscernable d'un export où l'utilisateur n'en avait
 * simplement jamais saisi.
 */
export const EXPORT_VERSION = 5;

export type ExportedWork = {
  id: string;
  type: string;
  titleFr: string;
  titleOriginal: string | null;
  /** Code ISO 639-1 — la langue du texte, pas celle d'une traduction. */
  originalLanguage: string | null;
  year: number | null;
  synopsis: string | null;
  durationMinutes: number | null;
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
    title: string | null;
    language: string | null;
    translators: string[];
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
    /** Réglages de visibilité (lot 4, D26) — absents des exports v1 et v2. */
    visibility?: string;
    showJournalPublicly?: boolean;
    showStatsPublicly?: boolean;
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
  goals: unknown[];
  // Social (lot 4) — les gestes de l'utilisateur, pas ceux qu'il a reçus.
  follows: unknown[];
  socialLikes: unknown[];
  comments: unknown[];
  blocks: unknown[];
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
  "objectifs",
  "editions",
  // Social (lot 4)
  "abonnements",
  "jaime-sociaux",
  "commentaires",
  "blocages",
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
  objectifs: "Objectifs annuels",
  editions: "Éditions",
  abonnements: "Abonnements",
  "jaime-sociaux": "J'aime sur des publications",
  commentaires: "Commentaires",
  blocages: "Comptes bloqués",
};
