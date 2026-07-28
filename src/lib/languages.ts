/**
 * Langues (lot 5) — logique pure.
 *
 * Une langue est stockée par son **code ISO 639-1** et non par son libellé :
 * « français », « Français » et « fr » désigneraient sinon trois langues, et
 * aucun filtre ne s'y retrouverait. La liste ci-dessous n'est qu'une aide à la
 * saisie — un code absent reste acceptable, il s'affichera tel quel plutôt que
 * de laisser un trou.
 */

export type Language = { code: string; label: string };

export const LANGUAGES: Language[] = [
  { code: "fr", label: "Français" },
  { code: "en", label: "Anglais" },
  { code: "ja", label: "Japonais" },
  { code: "es", label: "Espagnol" },
  { code: "it", label: "Italien" },
  { code: "de", label: "Allemand" },
  { code: "pt", label: "Portugais" },
  { code: "nl", label: "Néerlandais" },
  { code: "ru", label: "Russe" },
  { code: "pl", label: "Polonais" },
  { code: "sv", label: "Suédois" },
  { code: "da", label: "Danois" },
  { code: "no", label: "Norvégien" },
  { code: "fi", label: "Finnois" },
  { code: "is", label: "Islandais" },
  { code: "zh", label: "Chinois" },
  { code: "ko", label: "Coréen" },
  { code: "ar", label: "Arabe" },
  { code: "he", label: "Hébreu" },
  { code: "tr", label: "Turc" },
  { code: "el", label: "Grec" },
  { code: "la", label: "Latin" },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l.label]));
const BY_LABEL = new Map(
  LANGUAGES.map((l) => [l.label.toLowerCase(), l.code] as const),
);

/**
 * Ramène une saisie à un code : « Français », « FR » et « fr » donnent tous
 * `fr`. Une saisie inconnue est conservée en minuscules — mieux vaut une
 * langue mal codée qu'une langue perdue.
 */
export function normalizeLanguage(
  raw: string | null | undefined,
): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  return BY_LABEL.get(lower) ?? lower;
}

/** Le libellé français d'un code, ou le code lui-même s'il est inconnu. */
export function languageLabel(code: string | null | undefined): string | null {
  const normalized = normalizeLanguage(code);
  if (!normalized) return null;
  return BY_CODE.get(normalized) ?? normalized;
}
