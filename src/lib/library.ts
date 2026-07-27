/**
 * Facettes de la bibliothèque (lot 3, S12) — logique pure.
 *
 * La page `/bibliotheque` ne doit rien décider : elle reçoit une requête déjà
 * validée et des liens déjà construits. Toute valeur inconnue est ramenée à son
 * défaut plutôt que rejetée — une URL bricolée à la main n'a pas à produire
 * d'erreur.
 */

import type { WorkStatusState, WorkType } from "@/generated/prisma/enums";
import { isWorkType } from "./media";
import { starsToScore } from "./rating";

export const LIBRARY_SORTS = [
  "recent",
  "titre",
  "note",
  "annee",
  "ajout",
] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

export const LIBRARY_SORT_LABELS: Record<LibrarySort, string> = {
  recent: "Activité récente",
  titre: "Titre",
  note: "Note",
  annee: "Année",
  ajout: "Date d'ajout",
};

export const LIBRARY_VIEWS = ["grille", "liste"] as const;
export type LibraryView = (typeof LIBRARY_VIEWS)[number];

const STATES: WorkStatusState[] = [
  "WANT",
  "IN_PROGRESS",
  "ON_HOLD",
  "DROPPED",
  "COMPLETED",
  "CAUGHT_UP",
];

export type LibraryQuery = {
  type?: WorkType;
  state?: WorkStatusState;
  /** Note plancher, **sur 10** — prête pour la requête, pas pour l'affichage. */
  minScore?: number;
  year?: number;
  genre?: string;
  tag?: string;
  sort: LibrarySort;
  view: LibraryView;
};

export type RawParams = Record<string, string | undefined>;

/** Lit les `searchParams` bruts. Rien ne lève : l'inconnu est ignoré. */
export function parseLibraryQuery(sp: RawParams): LibraryQuery {
  const type = sp.type && isWorkType(sp.type) ? sp.type : undefined;

  const state =
    sp.statut && (STATES as string[]).includes(sp.statut)
      ? (sp.statut as WorkStatusState)
      : undefined;

  const sort = (LIBRARY_SORTS as readonly string[]).includes(sp.tri ?? "")
    ? (sp.tri as LibrarySort)
    : "recent";

  const view = sp.vue === "liste" ? "liste" : "grille";

  return {
    type,
    state,
    minScore: parseStars(sp.note),
    year: parseYear(sp.annee),
    genre: sp.genre?.trim() || undefined,
    tag: sp.tag?.trim() || undefined,
    sort,
    view,
  };
}

/**
 * Note plancher saisie en étoiles, virgule française acceptée (« 3,5 »), puis
 * convertie en score sur 10 — l'échelle de stockage (D3).
 */
function parseStars(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const stars = Number(raw.replace(",", "."));
  if (!Number.isFinite(stars) || stars < 0.5 || stars > 5) return undefined;
  // Arrondi au demi-point : l'échelle n'admet rien d'autre.
  return starsToScore(Math.round(stars * 2) / 2);
}

function parseYear(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 1800 || year > 2200) return undefined;
  return year;
}

/**
 * La requête re-sérialisée en paramètres d'URL. Les valeurs par défaut ne sont
 * jamais émises : c'est ce que le passe-plat `params` de `MediaFilter` attend,
 * et cela garde les liens lisibles.
 */
export function libraryParams(q: LibraryQuery): RawParams {
  return {
    statut: q.state,
    note: q.minScore == null ? undefined : formatStarsParam(q.minScore),
    annee: q.year == null ? undefined : String(q.year),
    genre: q.genre,
    tag: q.tag,
    tri: q.sort === "recent" ? undefined : q.sort,
    vue: q.view === "grille" ? undefined : q.view,
  };
}

function formatStarsParam(score: number): string {
  return String(score / 2).replace(".", ",");
}

/**
 * Lien vers la même page avec une facette modifiée. Passer `undefined` pour une
 * facette la retire — c'est ainsi que se rend le choix « tous ».
 */
export function libraryHref(
  basePath: string,
  current: LibraryQuery,
  patch: Partial<LibraryQuery>,
): string {
  const next: LibraryQuery = { ...current, ...patch };
  const sp = new URLSearchParams();

  if (next.type) sp.set("type", next.type);
  for (const [key, value] of Object.entries(libraryParams(next))) {
    if (value) sp.set(key, value);
  }

  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
