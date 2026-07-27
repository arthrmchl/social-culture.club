/** Registre des adaptateurs d'import (lot 2) et détection de la source. */

import type { ImportSource } from "@/generated/prisma/enums";
import type { ImportedFile, SourceAdapter } from "../types";
import { letterboxdAdapter } from "./letterboxd";
import { goodreadsAdapter } from "./goodreads";
import { serializdAdapter } from "./serializd";

export const ADAPTERS: SourceAdapter[] = [
  letterboxdAdapter,
  goodreadsAdapter,
  serializdAdapter,
];

/** Adaptateurs proposés à l'utilisateur, dans l'ordre d'affichage. */
export const IMPORTABLE_SOURCES = ADAPTERS.map((a) => ({
  source: a.source,
  label: a.label,
  hint: a.hint,
}));

export function adapterFor(source: ImportSource): SourceAdapter | null {
  return ADAPTERS.find((a) => a.source === source) ?? null;
}

/**
 * Devine la source d'après les fichiers déposés. L'utilisateur garde toujours
 * la main : ce n'est qu'une présélection.
 */
export function detectSource(
  files: ImportedFile[],
): { source: ImportSource; confidence: number } | null {
  if (files.length === 0) return null;

  const scored = ADAPTERS.map((a) => ({
    source: a.source,
    confidence: a.detect(files),
  })).sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  return best.confidence > 0 ? best : null;
}

export { letterboxdAdapter, goodreadsAdapter, serializdAdapter };
