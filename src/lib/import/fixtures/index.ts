/** Lecture des fixtures d'export tiers, partagée par les tests et verify.ts. */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { ImportedFile } from "../types";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

/** Tous les fichiers d'un dossier de fixtures, chemins relatifs conservés. */
export function loadFixture(source: string): ImportedFile[] {
  const dir = path.join(ROOT, source);
  return walk(dir).map((abs) => ({
    name: path.relative(dir, abs).split(path.sep).join("/"),
    content: readFileSync(abs, "utf8"),
  }));
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const abs = path.join(dir, entry);
    return statSync(abs).isDirectory() ? walk(abs) : [abs];
  });
}
