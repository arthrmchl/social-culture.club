/**
 * Listes Letterboxd (lot 3, S9) — logique pure.
 *
 * Module distinct de `letterboxd.ts` parce qu'un fichier de liste a une forme
 * que le lecteur de l'adaptateur ne sait pas lire : **deux blocs CSV** séparés
 * par une ligne vide.
 *
 *     Date,Name,Tags,URL,Description        ← métadonnées de la liste
 *     2026-01-01,Mes favoris,,https://…,Une liste de test
 *
 *     Position,Name,Year,Letterboxd URI,Description   ← les éléments
 *     1,Dune,2021,https://letterboxd.com/film/dune-2021/,
 *
 * `detectHeaderLine(content, ["Name"])` tomberait sur le premier en-tête,
 * celui des métadonnées. On cherche donc explicitement l'en-tête des éléments,
 * repérable à deux colonnes que le bloc de métadonnées ne porte jamais.
 */

import { detectHeaderLine, parseCsv, toRecords } from "../csv";
import { cell, resolveColumns } from "../headers";
import { parseImportDate, parseYear, splitTags } from "../values";
import { letterboxdSlug } from "../infer";
import { slugify } from "@/lib/text";
import type { ImportedFile, ImportWarning } from "../types";

/** Alias de colonnes — le seul endroit à corriger si l'export change. */
const META_COLUMNS = {
  date: ["Date"],
  name: ["Name"],
  tags: ["Tags"],
  url: ["URL"],
  description: ["Description"],
} as const;

const ITEM_COLUMNS = {
  position: ["Position"],
  name: ["Name"],
  year: ["Year"],
  uri: ["Letterboxd URI"],
  description: ["Description"],
} as const;

/** Colonnes qui distinguent l'en-tête des éléments de celui des métadonnées. */
const ITEM_HEADER_MARKERS = ["Position", "Letterboxd URI"];

export type ParsedListItem = {
  position: number | null;
  titleFr: string;
  year: number | null;
  /** Slug Letterboxd — la même clé que le diary, donc le même rapprochement. */
  externalId: string | null;
  note: string | null;
  line: number;
};

export type ParsedList = {
  name: string;
  slug: string;
  description: string | null;
  /** Étiquettes de la liste — non reprises au lot 3, mais signalées. */
  tags: string[];
  createdAt: Date | null;
  /** Vraie liste ordonnée : toutes les positions sont présentes et distinctes. */
  isRanked: boolean;
  items: ParsedListItem[];
  sourceFile: string;
};

/**
 * Lit un fichier de liste. Renvoie `null` — jamais d'exception (R5) — si le
 * bloc d'éléments est absent ou illisible, en laissant un avertissement.
 */
export function parseLetterboxdList(
  file: ImportedFile,
  warnings: ImportWarning[],
): ParsedList | null {
  // 1. Métadonnées : le premier bloc, dont on ne lit que la première ligne.
  const metaTable = parseCsv(file.content);
  const metaRecords = toRecords(metaTable);
  const meta = resolveColumns(metaTable.headers, META_COLUMNS, []);
  const first = metaRecords[0];

  const name = first ? cell(first, meta.map, "name").trim() : "";
  if (!name) {
    warnings.push({
      level: "warning",
      file: file.name,
      message:
        "Nom de liste introuvable : ce fichier ne ressemble pas à une liste Letterboxd.",
    });
    return null;
  }

  // 2. Éléments : le second bloc, repéré par ses colonnes propres.
  const headerLine = detectHeaderLine(file.content, ITEM_HEADER_MARKERS);
  if (headerLine < 0) {
    warnings.push({
      level: "warning",
      file: file.name,
      message: `La liste « ${name} » ne contient aucun film : seules ses informations ont été trouvées.`,
    });
    return null;
  }

  const itemTable = parseCsv(file.content, { skipLines: headerLine });
  const items = resolveColumns(itemTable.headers, ITEM_COLUMNS, ["name"]);
  if (items.missing.length > 0) {
    warnings.push({
      level: "warning",
      file: file.name,
      message: `Colonne « ${items.missing[0]} » introuvable dans la liste « ${name} » : elle a été ignorée.`,
    });
    return null;
  }

  const parsed: ParsedListItem[] = [];
  toRecords(itemTable).forEach((rec, idx) => {
    const titleFr = cell(rec, items.map, "name").trim();
    if (!titleFr) return;

    const rawPosition = cell(rec, items.map, "position").trim();
    const position = /^\d+$/.test(rawPosition) ? Number(rawPosition) : null;

    parsed.push({
      position,
      titleFr,
      year: parseYear(cell(rec, items.map, "year")),
      externalId: letterboxdSlug(cell(rec, items.map, "uri")),
      note: cell(rec, items.map, "description").trim() || null,
      line: headerLine + idx + 2, // +1 en-tête, +1 pour compter à partir de 1
    });
  });

  if (parsed.length === 0) {
    warnings.push({
      level: "warning",
      file: file.name,
      message: `La liste « ${name} » est vide.`,
    });
    return null;
  }

  // Une liste n'est « ordonnée » que si Letterboxd a réellement numéroté ses
  // éléments : une colonne Position vide signale un simple recueil.
  const positions = parsed.map((p) => p.position);
  const isRanked =
    positions.every((p) => p !== null) &&
    new Set(positions).size === positions.length;

  if (!isRanked && positions.some((p) => p !== null)) {
    warnings.push({
      level: "info",
      file: file.name,
      message: `Les positions de la liste « ${name} » sont incomplètes : elle sera reprise sans classement.`,
    });
  }

  const tags = splitTags(first ? cell(first, meta.map, "tags") : "");
  if (tags.length > 0) {
    warnings.push({
      level: "info",
      file: file.name,
      message: `Les étiquettes de la liste « ${name} » ne sont pas reprises : les tags portent sur les œuvres et le journal, pas sur les listes.`,
    });
  }

  return {
    name,
    slug: slugify(name) || "liste",
    description: cell(first, meta.map, "description").trim() || null,
    tags,
    createdAt: parseImportDate(cell(first, meta.map, "date")).date,
    isRanked,
    items: parsed,
    sourceFile: file.name,
  };
}

/** Tous les fichiers de listes d'un dépôt. */
export function parseLetterboxdLists(files: ImportedFile[]): {
  lists: ParsedList[];
  warnings: ImportWarning[];
} {
  const warnings: ImportWarning[] = [];
  const lists: ParsedList[] = [];

  for (const file of files) {
    const list = parseLetterboxdList(file, warnings);
    if (list) lists.push(list);
  }

  return { lists, warnings };
}
