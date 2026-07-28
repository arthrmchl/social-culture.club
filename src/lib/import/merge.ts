/**
 * Regroupement des événements en cibles (lot 2, I6) — logique pure.
 *
 * Le rapprochement se décide **par œuvre**, pas par ligne : trois visionnages,
 * une note et un j'aime pour le même film ne demandent qu'une seule décision.
 * C'est ce qui rend l'écran de rapprochement praticable sur un export réel.
 *
 * La fusion propre à une source (diary + reviews de Letterboxd) a déjà eu lieu
 * dans son adaptateur ; ici on ne connaît plus que des événements canoniques.
 */

import { normalizeTitle } from "@/lib/text";
import type { ImportSource, WorkType } from "@/generated/prisma/enums";
import { assignImportKeys, workKey } from "./dedup";
import type { ImportedEvent, ImportedWorkRef } from "./types";

export type MergedEvent = { event: ImportedEvent; importKey: string };

export type MergedTarget = {
  workKey: string;
  ref: ImportedWorkRef;
  titleNormalized: string;
  /** Saisons rencontrées (Serializd) — à créer si la fiche est créée. */
  seasons: number[];
  /** Tomes rencontrés (volumes Goodreads) — idem. */
  volumes: number[];
  events: MergedEvent[];
  /** Compteurs affichés sur la carte de rapprochement. */
  counts: { logs: number; ratings: number; reviews: number; other: number };
};

/**
 * Regroupe et ordonne. Le résultat est déterministe : deux analyses du même
 * export produisent exactement les mêmes cibles, dans le même ordre.
 */
export function groupIntoTargets(
  source: ImportSource,
  events: ImportedEvent[],
): MergedTarget[] {
  const keyed = assignImportKeys(source, events);
  const targets = new Map<string, MergedTarget>();

  for (const item of keyed) {
    const key = workKey(item.event.work);
    const existing = targets.get(key);

    if (existing) {
      existing.ref = consolidate(existing.ref, item.event.work);
      existing.titleNormalized = normalizeTitle(existing.ref.titleFr);
      existing.events.push(item);
      collectSubUnits(existing, item.event.work);
      count(existing, item.event);
      continue;
    }

    const target: MergedTarget = {
      workKey: key,
      ref: { ...item.event.work },
      titleNormalized: normalizeTitle(item.event.work.titleFr),
      seasons: [],
      volumes: [],
      events: [item],
      counts: { logs: 0, ratings: 0, reviews: 0, other: 0 },
    };
    collectSubUnits(target, item.event.work);
    count(target, item.event);
    targets.set(key, target);
  }

  return [...targets.values()]
    .map((t) => ({
      ...t,
      seasons: [...t.seasons].sort((a, b) => a - b),
      volumes: [...t.volumes].sort((a, b) => a - b),
    }))
    .sort((a, b) => a.titleNormalized.localeCompare(b.titleNormalized));
}

/**
 * Complète une référence avec ce qu'en dit un autre fichier : on ne remplace
 * jamais une valeur connue par une valeur absente. Le titre le plus court
 * l'emporte (« Berserk » plutôt que « Berserk, Vol. 12 » déjà nettoyé).
 */
function consolidate(
  base: ImportedWorkRef,
  next: ImportedWorkRef,
): ImportedWorkRef {
  return {
    externalId: base.externalId ?? next.externalId,
    type: mergeType(base.type, next.type),
    titleFr: next.titleFr.length < base.titleFr.length ? next.titleFr : base.titleFr,
    titleOriginal: base.titleOriginal ?? next.titleOriginal,
    year: base.year ?? next.year,
    isbn: base.isbn ?? next.isbn,
    pageCount: base.pageCount ?? next.pageCount,
    creators: [...new Set([...base.creators, ...next.creators])],
    // Les sous-unités sont propres à chaque événement : elles vivent dans
    // MergedTarget.seasons / .volumes, pas dans la référence consolidée.
    seasonNumber: null,
    volumeNumber: null,
  };
}

/** Un type porteur de sous-unités est plus informatif qu'un type simple. */
function mergeType(a: WorkType, b: WorkType): WorkType {
  if (a === b) return a;
  const rank: Record<WorkType, number> = {
    BOOK: 0,
    FILM: 1,
    SERIES: 2,
    ANIME: 2,
    BD_SERIES: 2,
    MANGA_SERIES: 2,
  };
  return rank[b] > rank[a] ? b : a;
}

function collectSubUnits(target: MergedTarget, ref: ImportedWorkRef): void {
  if (ref.seasonNumber !== null && !target.seasons.includes(ref.seasonNumber)) {
    target.seasons.push(ref.seasonNumber);
  }
  if (ref.volumeNumber !== null && !target.volumes.includes(ref.volumeNumber)) {
    target.volumes.push(ref.volumeNumber);
  }
}

function count(target: MergedTarget, event: ImportedEvent): void {
  if (event.kind === "LOG") target.counts.logs += 1;
  else if (event.kind === "RATING") target.counts.ratings += 1;
  else if (event.kind === "REVIEW") target.counts.reviews += 1;
  else target.counts.other += 1;

  if (event.reviewText) target.counts.reviews += event.kind === "REVIEW" ? 0 : 1;
}

/** Résumé français d'une cible, affiché sur sa carte de rapprochement. */
export function describeTarget(target: MergedTarget): string {
  const parts: string[] = [];
  const { logs, ratings, reviews } = target.counts;

  if (logs > 0) parts.push(logs === 1 ? "1 entrée" : `${logs} entrées`);
  if (ratings > 0) parts.push(ratings === 1 ? "1 note" : `${ratings} notes`);
  if (reviews > 0) parts.push(reviews === 1 ? "1 critique" : `${reviews} critiques`);
  if (target.seasons.length > 0) {
    parts.push(
      target.seasons.length === 1
        ? "1 saison"
        : `${target.seasons.length} saisons`,
    );
  }
  if (target.volumes.length > 0) {
    parts.push(
      target.volumes.length === 1 ? "1 tome" : `${target.volumes.length} tomes`,
    );
  }

  return parts.length > 0 ? parts.join(" · ") : "aucune donnée";
}
