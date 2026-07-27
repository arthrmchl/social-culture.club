/**
 * Parseur CSV (RFC 4180) — logique pure, sans dépendance (lot 2).
 *
 * Tolérant par construction : BOM, CRLF, guillemets, guillemets doublés,
 * virgules et sauts de ligne encapsulés, lignes plus courtes que l'en-tête,
 * dernière ligne sans retour final. Les exports tiers sont hétérogènes (R5) :
 * on ne plante jamais, on dégrade.
 */

export type CsvTable = { headers: string[]; rows: string[][] };

/** Découpe brute en grille, sans interprétation de l'en-tête. */
export function parseCsvGrid(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (src === "") return [];

  const grid: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    grid.push(row);
    row = [];
  };

  while (i < src.length) {
    const c = src[i];

    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'; // guillemet doublé, échappé
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }

    if (c === '"' && field === "") {
      quoted = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      endField();
      i += 1;
      continue;
    }
    if (c === "\r") {
      // CRLF ou CR seul
      endRow();
      i += src[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (c === "\n") {
      endRow();
      i += 1;
      continue;
    }

    field += c;
    i += 1;
  }

  // Dernière ligne sans retour final (mais pas de ligne vide fantôme).
  if (field !== "" || row.length > 0) endRow();

  return grid;
}

/**
 * Grille + en-tête. `skipLines` saute un préambule (les listes Letterboxd
 * commencent par quelques lignes de métadonnées avant l'en-tête réel).
 */
export function parseCsv(text: string, opts?: { skipLines?: number }): CsvTable {
  const grid = parseCsvGrid(text);
  const skip = opts?.skipLines ?? 0;
  const useful = grid.slice(skip).filter((r) => !isBlankRow(r));
  if (useful.length === 0) return { headers: [], rows: [] };

  const [headers, ...rows] = useful;
  return { headers: headers.map((h) => h.trim()), rows };
}

/** Table -> objets { enTête: valeur }. Les colonnes manquantes valent "". */
export function toRecords(table: CsvTable): Record<string, string>[] {
  return table.rows.map((row) => {
    const rec: Record<string, string> = {};
    table.headers.forEach((h, idx) => {
      rec[h] = row[idx] ?? "";
    });
    return rec;
  });
}

/**
 * Index (0-based) de la ligne d'en-tête : la première qui contient toutes les
 * colonnes attendues. -1 si aucune ne correspond. Sert à sauter le préambule
 * des exports de listes sans coder en dur son nombre de lignes.
 */
export function detectHeaderLine(text: string, expected: string[]): number {
  const grid = parseCsvGrid(text);
  const wanted = expected.map((e) => e.trim().toLowerCase());

  for (let i = 0; i < grid.length; i += 1) {
    const cells = grid[i].map((c) => c.trim().toLowerCase());
    if (wanted.every((w) => cells.includes(w))) return i;
  }
  return -1;
}

function isBlankRow(row: string[]): boolean {
  return row.every((c) => c.trim() === "");
}
