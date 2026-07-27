/**
 * Convertisseurs de valeurs brutes des exports tiers (lot 2) — logique pure.
 *
 * Les notes sortent d'ici sur l'échelle interne (sur 10, S5/D3) en passant par
 * `starsToScore` : l'échelle n'est jamais réimplémentée.
 */

import { starsToScore } from "@/lib/rating";
import type { DatePrecision } from "@/generated/prisma/enums";

export type ParsedDate = { date: Date | null; precision: DatePrecision };

const UNKNOWN: ParsedDate = { date: null, precision: "UNKNOWN" };

/**
 * Date d'un export : `YYYY-MM-DD`, `YYYY/MM/DD`, `YYYY-MM`, `YYYY`,
 * `DD/MM/YYYY`, ou horodatage ISO. Vide ou illisible → date inconnue (S4).
 * Les dates sont construites en UTC à midi pour qu'un décalage de fuseau ne
 * fasse jamais basculer le jour.
 */
export function parseImportDate(raw: string): ParsedDate {
  const s = (raw ?? "").trim();
  if (!s) return UNKNOWN;

  // ISO complet (avec heure) — on garde l'instant tel quel.
  const iso = /^(\d{4})-(\d{2})-(\d{2})[T ]/.exec(s);
  if (iso) {
    const d = new Date(s);
    return Number.isNaN(d.getTime())
      ? UNKNOWN
      : { date: d, precision: "DAY" };
  }

  // YYYY-MM-DD ou YYYY/MM/DD
  const ymd = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (ymd) {
    return build(+ymd[1], +ymd[2], +ymd[3], "DAY");
  }

  // YYYY-MM
  const ym = /^(\d{4})[-/](\d{1,2})$/.exec(s);
  if (ym) {
    return build(+ym[1], +ym[2], 1, "MONTH");
  }

  // YYYY
  const y = /^(\d{4})$/.exec(s);
  if (y) {
    return build(+y[1], 1, 1, "YEAR");
  }

  // DD/MM/YYYY — format français, distingué de MM/DD/YYYY par le jour > 12.
  // Ambigu en deçà : on privilégie le français (N8), l'écart est d'un jour.
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (dmy) {
    return build(+dmy[3], +dmy[2], +dmy[1], "DAY");
  }

  return UNKNOWN;
}

function build(
  year: number,
  month: number,
  day: number,
  precision: DatePrecision,
): ParsedDate {
  if (month < 1 || month > 12 || day < 1 || day > 31) return UNKNOWN;
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (Number.isNaN(date.getTime())) return UNKNOWN;
  // Rejette les dates repliées (31 février → 3 mars).
  if (date.getUTCMonth() !== month - 1) return UNKNOWN;
  return { date, precision };
}

/**
 * Note Letterboxd : 0,5 à 5 par demi-point → score sur 10.
 * "0" et "" signifient « pas de note » (Goodreads comme Letterboxd).
 */
export function parseHalfStarRating(raw: string): number | null {
  const s = (raw ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return starsToScore(Math.min(n, 5));
}

/**
 * Note entière sur `max` (Goodreads : 0–5) → score sur 10.
 * 0 signifie « pas de note ».
 */
export function parseIntegerRating(raw: string, max: 5 | 10): number | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  const clamped = Math.min(n, max);
  return max === 5 ? starsToScore(clamped) : Math.round(clamped);
}

/** Année plausible, sinon null (les exports contiennent des 0 et des vides). */
export function parseYear(raw: string): number | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n)) return null;
  if (n < 1000 || n > new Date().getFullYear() + 5) return null;
  return n;
}

/** Entier positif, sinon null (pagination, nombre de lectures…). */
export function parseCount(raw: string): number | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Booléen d'export : Yes/No, true/false, 1/0, oui/non. */
export function parseYesNo(raw: string): boolean {
  const s = (raw ?? "").trim().toLowerCase();
  return s === "yes" || s === "true" || s === "1" || s === "oui" || s === "y";
}

/**
 * ISBN saisi (D6 : champ libre, jamais utilisé pour un lookup externe).
 * Goodreads exporte `="9782070612888"` pour empêcher le tableur de tronquer.
 */
export function cleanIsbn(raw: string): string | null {
  const s = (raw ?? "").trim().replace(/^="?|"?$/g, "");
  const digits = s.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (digits.length !== 10 && digits.length !== 13) return null;
  return digits;
}

/**
 * Entités nommées rencontrées dans les critiques exportées. Les accents
 * français y sont fréquents : sans elles, « le d&eacute;sert » resterait tel
 * quel dans le journal.
 */
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  laquo: "«",
  raquo: "»",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  agrave: "à",
  acirc: "â",
  ccedil: "ç",
  eacute: "é",
  egrave: "è",
  ecirc: "ê",
  euml: "ë",
  icirc: "î",
  iuml: "ï",
  ocirc: "ô",
  oelig: "œ",
  ugrave: "ù",
  ucirc: "û",
  uuml: "ü",
  deg: "°",
  euro: "€",
};

/** Décode les entités numériques (&#233;, &#xE9;) et nommées. */
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    )
    .replace(/&([a-z]+);/gi, (match, name: string) => {
      const key = name.toLowerCase();
      const upper = /^[A-Z]/.test(name);
      const value = NAMED_ENTITIES[key];
      if (value === undefined) return match; // inconnue : on n'invente rien
      // &Eacute; → É, tout en gardant &AMP; → &
      return upper && value.length === 1 ? value.toUpperCase() : value;
    });
}

/**
 * Critique Goodreads : du HTML léger. On le ramène à du texte lisible, que
 * l'application affichera ensuite comme du markdown (S7).
 */
export function htmlToText(raw: string): string {
  if (!raw) return "";
  const text = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");

  return decodeEntities(text).replace(/\n{3,}/g, "\n\n").trim();
}

/** Liste séparée par des virgules (tags, étagères, auteurs additionnels). */
export function splitTags(raw: string): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
}
