/**
 * Écriture CSV (RFC 4180) — logique pure, miroir du parseur d'import.
 *
 * L'aller-retour est testé : ce que produit `toCsv` doit se relire à
 * l'identique avec `parseCsv`. Un export illisible par l'application qui l'a
 * produit ne vaudrait rien (I4, N4).
 */

/** Une valeur exportable — les dates sortent en ISO, les nuls en vide. */
export type CsvValue = string | number | boolean | Date | null | undefined;

export type CsvColumn<T> = {
  /** En-tête, en français : le fichier doit être lisible sans l'application. */
  header: string;
  value: (row: T) => CsvValue;
};

/** Échappe une valeur : guillemets si séparateur, guillemet ou saut de ligne. */
export function toCsvField(value: CsvValue): string {
  if (value === null || value === undefined) return "";

  const text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "boolean"
        ? value
          ? "oui"
          : "non"
        : String(value);

  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsvLine(values: CsvValue[]): string {
  return values.map(toCsvField).join(",");
}

/** Document CSV complet, en-tête compris. Terminé par un saut de ligne. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [toCsvLine(columns.map((c) => c.header))];
  for (const row of rows) {
    lines.push(toCsvLine(columns.map((c) => c.value(row))));
  }
  return `${lines.join("\n")}\n`;
}
