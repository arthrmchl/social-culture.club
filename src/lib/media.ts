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
  FILM: { type: "FILM", label: "Film", plural: "Films", emoji: "🎬", subUnit: null },
  SERIES: { type: "SERIES", label: "Série", plural: "Séries", emoji: "📺", subUnit: "episodes" },
  ANIME: { type: "ANIME", label: "Animé", plural: "Animés", emoji: "🌸", subUnit: "episodes" },
  BOOK: { type: "BOOK", label: "Livre", plural: "Livres", emoji: "📖", subUnit: null },
  BD_SERIES: { type: "BD_SERIES", label: "BD", plural: "BD", emoji: "🗯️", subUnit: "tomes" },
  MANGA_SERIES: { type: "MANGA_SERIES", label: "Manga", plural: "Mangas", emoji: "🀄", subUnit: "tomes" },
  ONE_SHOT: { type: "ONE_SHOT", label: "One-shot", plural: "One-shots", emoji: "📕", subUnit: null },
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
