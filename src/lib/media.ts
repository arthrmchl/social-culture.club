import type { WorkType } from "@/generated/prisma/enums";

export type MediaMeta = {
  type: WorkType;
  label: string;
  plural: string;
  emoji: string;
  /** Sous-unités générables à la création (S2). */
  subUnit: "episodes" | "tomes" | null;
};

export const MEDIA: Record<WorkType, MediaMeta> = {
  FILM: {
    type: "FILM",
    label: "Film",
    plural: "Films",
    emoji: "🎬",
    subUnit: null,
  },
  SERIES: {
    type: "SERIES",
    label: "Série",
    plural: "Séries",
    emoji: "📺",
    subUnit: "episodes",
  },
  ANIME: {
    type: "ANIME",
    label: "Animé",
    plural: "Animés",
    emoji: "🌸",
    subUnit: "episodes",
  },
  BOOK: {
    type: "BOOK",
    label: "Livre",
    plural: "Livres",
    emoji: "📖",
    subUnit: null,
  },
  BD_SERIES: {
    type: "BD_SERIES",
    label: "BD",
    plural: "BD",
    emoji: "🗯️",
    subUnit: "tomes",
  },
  MANGA_SERIES: {
    type: "MANGA_SERIES",
    label: "Manga",
    plural: "Mangas",
    emoji: "🀄",
    subUnit: "tomes",
  },
  ONE_SHOT: {
    type: "ONE_SHOT",
    label: "One-shot",
    plural: "One-shots",
    emoji: "📕",
    subUnit: null,
  },
};

export const MEDIA_ORDER: WorkType[] = [
  "FILM",
  "SERIES",
  "ANIME",
  "BOOK",
  "BD_SERIES",
  "MANGA_SERIES",
  "ONE_SHOT",
];

export const WORK_TYPES = MEDIA_ORDER;

export function mediaLabel(type: WorkType): string {
  return MEDIA[type].label;
}

export function isWorkType(value: string): value is WorkType {
  return value in MEDIA;
}

/** Média suivi à l'épisode (séries, animés) — progression T1/T4. */
export function usesEpisodes(type: WorkType): boolean {
  return MEDIA[type].subUnit === "episodes";
}

/** Média suivi au tome (BD, mangas) — progression L4. */
export function usesTomes(type: WorkType): boolean {
  return MEDIA[type].subUnit === "tomes";
}

/** Média suivi à la page (livres, one-shots) — progression L2. */
export function usesPages(type: WorkType): boolean {
  return type === "BOOK" || type === "ONE_SHOT";
}

/**
 * Une lecture, au sens de D9 et D12 : livres, BD, mangas, one-shots. C'est le
 * périmètre des citations (L3) et de l'objectif « lectures » (L5).
 */
export function isReading(type: WorkType): boolean {
  return usesPages(type) || usesTomes(type);
}

/**
 * Année d'une fiche à l'affichage. Les fiches importées (lot 2, I1) peuvent
 * arriver sans année : on l'annonce plutôt que d'afficher un trou.
 */
export function formatYear(year: number | null | undefined): string {
  return year == null ? "Année inconnue" : String(year);
}
