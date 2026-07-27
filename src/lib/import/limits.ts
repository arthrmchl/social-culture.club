/**
 * Plafonds du téléversement d'import (lot 2). Un CSV de 10 Mo devient une
 * centaine de méga-octets une fois transformé en objets JS : mieux vaut un
 * refus clair qu'un serveur qui s'étrangle.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 Mo par fichier
export const MAX_BATCH_BYTES = 30 * 1024 * 1024; // 30 Mo par lot
export const MAX_FILES = 40;
export const MAX_ROWS = 50_000;

/** Extensions acceptées — le pipeline ne lit que du texte tabulé. */
export const ACCEPTED_EXTENSIONS = [".csv", ".tsv", ".txt"] as const;

export function hasAcceptedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
