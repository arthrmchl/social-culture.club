/**
 * La cible d'un geste social (lot 4, P3) — logique pure.
 *
 * Trois choses peuvent recevoir un j'aime, un commentaire ou un signalement :
 * une entrée de journal, une liste, une critique d'œuvre. En base, ce sont
 * trois clés étrangères réelles et nullables (voir `SocialLike` dans le schéma :
 * c'est la cascade qui l'a imposé). En TypeScript, c'est une union discriminée.
 *
 * Ce module est le **seul** endroit qui traduise de l'une à l'autre. Sans lui,
 * chaque action réécrirait `{ journalEntryId: id, listId: null, userWorkId: null }`
 * à la main, et l'invariant « exactement une colonne renseignée » — que
 * PostgreSQL ne sait pas tenir, faute de CHECK en Prisma — se perdrait à la
 * première distraction.
 */

import { z } from "zod";

export const SOCIAL_TARGET_KINDS = ["entry", "list", "review"] as const;
export type SocialTargetKind = (typeof SOCIAL_TARGET_KINDS)[number];

/**
 * `review` désigne un `UserWork` — la critique courante d'une œuvre (S7), pas
 * l'œuvre elle-même : on commente ce qu'un membre a écrit, jamais une fiche du
 * catalogue partagé.
 */
export type SocialTarget = { kind: SocialTargetKind; id: string };

export const TARGET_LABELS: Record<SocialTargetKind, string> = {
  entry: "entrée de journal",
  list: "liste",
  review: "critique",
};

export const socialTargetSchema = z.object({
  kind: z.enum(SOCIAL_TARGET_KINDS, { message: "Cible sociale inconnue." }),
  id: z.string().min(1, "Cible sociale invalide."),
});

/** Les trois colonnes, telles que Prisma les attend. */
export type TargetColumns = {
  journalEntryId: string | null;
  listId: string | null;
  userWorkId: string | null;
};

/**
 * Le point unique de traduction vers les colonnes. Toute écriture sociale part
 * d'ici — c'est ce qui garantit qu'une seule des trois est jamais renseignée.
 */
export function targetColumns(target: SocialTarget): TargetColumns {
  switch (target.kind) {
    case "entry":
      return { journalEntryId: target.id, listId: null, userWorkId: null };
    case "list":
      return { journalEntryId: null, listId: target.id, userWorkId: null };
    case "review":
      return { journalEntryId: null, listId: null, userWorkId: target.id };
  }
}

/**
 * Le `where` d'une recherche par cible : une seule colonne, pas trois
 * comparaisons à `null` — Prisma sait alors se poser sur l'index dédié.
 */
export function targetWhere(target: SocialTarget): Partial<TargetColumns> {
  switch (target.kind) {
    case "entry":
      return { journalEntryId: target.id };
    case "list":
      return { listId: target.id };
    case "review":
      return { userWorkId: target.id };
  }
}

/**
 * L'inverse : retrouver la cible d'une ligne lue en base.
 *
 * Lève si zéro ou plusieurs colonnes sont renseignées. C'est délibéré : cet
 * état ne peut venir que d'une écriture qui aurait contourné `targetColumns`,
 * donc d'un bug — le masquer par un `null` complaisant le rendrait invisible
 * jusqu'à une corruption bien plus difficile à démêler.
 */
export function targetFromColumns(row: Partial<TargetColumns>): SocialTarget {
  const found: SocialTarget[] = [];
  if (row.journalEntryId) found.push({ kind: "entry", id: row.journalEntryId });
  if (row.listId) found.push({ kind: "list", id: row.listId });
  if (row.userWorkId) found.push({ kind: "review", id: row.userWorkId });

  if (found.length !== 1) {
    throw new Error(
      `Cible sociale incohérente : ${found.length} colonne(s) renseignée(s), une seule attendue.`,
    );
  }
  return found[0];
}

/** Ce qu'il faut pour construire le permalien d'une cible. */
export type TargetContext = {
  username: string;
  /** Slug de la liste — requis pour `list`. */
  slug?: string | null;
  /** Identifiant de l'œuvre — requis pour `review`. */
  workId?: string | null;
};

/**
 * Le permalien canonique d'une cible, sous le profil de son auteur.
 *
 * Un seul générateur pour le fil, les notifications, la file de modération et
 * les pages publiques : c'est ce qui fait qu'un j'aime, sa notification et le
 * lien qu'on suit désignent toujours le même écran.
 *
 * Renvoie `null` quand le contexte manque (une liste sans slug, une critique
 * sans œuvre) plutôt qu'une URL cassée — l'appelant affiche alors le libellé
 * sans lien, ce qui arrive légitimement dans la file de modération quand le
 * contenu visé a été supprimé.
 */
export function targetHref(
  target: SocialTarget,
  ctx: TargetContext,
): string | null {
  if (!ctx.username) return null;
  const base = `/u/${ctx.username}`;

  switch (target.kind) {
    case "entry":
      return `${base}/journal/${target.id}`;
    case "list":
      return ctx.slug ? `${base}/listes/${ctx.slug}` : null;
    case "review":
      return ctx.workId ? `${base}/critique/${ctx.workId}` : null;
  }
}
