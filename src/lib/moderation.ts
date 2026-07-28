/**
 * Modération (lot 4, D25, P4) — logique pure.
 *
 * Signalement, blocage, file d'administration. Pas de filtrage automatique :
 * D25 l'exclut explicitement, et rien ici ne juge un contenu — on ne fait que
 * le décrire assez pour qu'un humain décide.
 */

import type { ReportReason, ReportTargetKind } from "@/generated/prisma/enums";

export const REPORT_REASONS: ReportReason[] = [
  "SPAM",
  "HARASSMENT",
  "HATE",
  "SEXUAL",
  "VIOLENCE",
  "SPOILER",
  "OTHER",
];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  SPAM: "Spam ou publicité",
  HARASSMENT: "Harcèlement",
  HATE: "Propos haineux",
  SEXUAL: "Contenu sexuel",
  VIOLENCE: "Violence",
  SPOILER: "Divulgâchage non signalé",
  OTHER: "Autre",
};

export const REPORT_TARGET_LABELS: Record<ReportTargetKind, string> = {
  USER: "Compte",
  JOURNAL_ENTRY: "Entrée de journal",
  LIST: "Liste",
  REVIEW: "Critique",
  COMMENT: "Commentaire",
  WORK: "Fiche d'œuvre",
};

/** Longueur de l'instantané figé sur un signalement. */
export const EXCERPT_LENGTH = 200;

/**
 * Un extrait lisible du texte incriminé, figé à la création du signalement.
 *
 * Les clés étrangères d'un `Report` sont en SetNull : si l'administrateur
 * supprime le contenu, cet extrait est **tout ce qui reste** pour comprendre ce
 * qui avait été signalé. Il ne s'agit donc pas d'un confort d'affichage.
 *
 * Le markdown est retiré parce que la file de modération n'a pas à le rendre —
 * et parce qu'un extrait coupé au milieu d'une syntaxe produirait un affichage
 * bancal. La coupe se fait sur une frontière de mot quand c'est possible.
 */
export function buildExcerpt(
  text: string | null | undefined,
  max = EXCERPT_LENGTH,
): string | null {
  if (!text) return null;

  const plain = text
    // Liens markdown : on garde le libellé, on jette l'URL.
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Emphase, titres, citations, listes, code.
    .replace(/[*_`~#>]+/g, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!plain) return null;
  if (plain.length <= max) return plain;

  const cut = plain.slice(0, max);
  const space = cut.lastIndexOf(" ");
  // On ne recule pas jusqu'au début : un mot de 200 caractères se coupe net.
  const base = space > max * 0.6 ? cut.slice(0, space) : cut;
  return `${base.trimEnd()}…`;
}

/** Libellé figé d'une cible — jamais vide, la file doit rester lisible. */
export function buildLabel(
  kind: ReportTargetKind,
  raw: string | null | undefined,
): string {
  const trimmed = raw?.trim();
  return trimmed || REPORT_TARGET_LABELS[kind];
}

/** Les deux onglets de la file, en URL. */
export const MODERATION_TABS = ["ouverts", "traites"] as const;
export type ModerationTab = (typeof MODERATION_TABS)[number];

/** Ne lève jamais : l'inconnu retombe sur « ouverts » (règle du lot 3). */
export function parseModerationTab(raw: string | undefined): ModerationTab {
  return raw === "traites" ? "traites" : "ouverts";
}

export function isReportReason(value: string): value is ReportReason {
  return (REPORT_REASONS as string[]).includes(value);
}
