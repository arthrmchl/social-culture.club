/**
 * Idempotence des imports (lot 2, I6) — logique pure.
 *
 * Chaque événement reçoit une clé stable, recopiée dans
 * `JournalEntry.importKey`. Rejouer le même export ne crée alors rien de
 * nouveau : la contrainte `@@unique([userId, importKey])` absorbe la
 * répétition via `createMany({ skipDuplicates: true })`.
 *
 * La stabilité est la seule propriété qui compte : la clé ne doit dépendre ni
 * de l'ordre de lecture des fichiers, ni de l'heure de l'import, ni d'un
 * identifiant généré en base.
 */

import { createHash } from "node:crypto";
import { normalizeTitle } from "@/lib/text";
import type { ImportRowKind, ImportSource } from "@/generated/prisma/enums";
import type { ImportedEvent, ImportedWorkRef } from "./types";

/** Clé stable = empreinte de (source, nature, graine). */
export function buildImportKey(
  source: ImportSource,
  kind: ImportRowKind,
  seed: string,
): string {
  return createHash("sha256")
    .update(`${source}|${kind}|${seed}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Clé de regroupement des événements en cibles : l'identifiant de la source
 * s'il existe, sinon l'identité naturelle de l'œuvre. C'est ce qui fait qu'un
 * film vu trois fois ne demande qu'une seule décision de rapprochement.
 */
export function workKey(ref: ImportedWorkRef): string {
  if (ref.externalId) return ref.externalId;
  const year = ref.year ?? "?";
  return `${ref.type}|${normalizeTitle(ref.titleFr)}|${year}`;
}

/**
 * Attribue sa clé définitive à chaque événement.
 *
 * Deux événements de même nature et de même graine (deux visionnages le même
 * jour, deux lectures sans date) sont départagés par un ordinal calculé après
 * un tri déterministe — d'où l'indépendance à l'ordre des fichiers.
 */
export function assignImportKeys(
  source: ImportSource,
  events: ImportedEvent[],
): { event: ImportedEvent; importKey: string }[] {
  const sorted = [...events].sort(compareEvents);
  const seen = new Map<string, number>();

  return sorted.map((event) => {
    const base = `${event.kind}|${event.seed}`;
    const ordinal = (seen.get(base) ?? 0) + 1;
    seen.set(base, ordinal);

    const seed = ordinal === 1 ? event.seed : `${event.seed}#${ordinal}`;
    return { event, importKey: buildImportKey(source, event.kind, seed) };
  });
}

/** Tri déterministe : graine, puis fichier, puis ligne. */
function compareEvents(a: ImportedEvent, b: ImportedEvent): number {
  return (
    a.kind.localeCompare(b.kind) ||
    a.seed.localeCompare(b.seed) ||
    a.sourceFile.localeCompare(b.sourceFile) ||
    a.sourceLine - b.sourceLine
  );
}
