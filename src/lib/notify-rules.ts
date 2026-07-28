/**
 * Quand notifier (lot 4, P3) — logique pure.
 *
 * Séparée de l'écriture pour être testable : la décision « faut-il notifier ? »
 * ne demande aucune base, seulement quatre faits déjà chargés. C'est aussi ce
 * qui permet de la relire d'un coup d'œil — une boîte de réception bruyante se
 * désactive, et une notification manquante ne se voit jamais.
 */

import type { NotificationType } from "@/generated/prisma/enums";

export type NotifyInput = {
  recipientId: string;
  /** Auteur du geste. `null` pour une notification système (modération). */
  actorId: string | null;
  /** Blocage entre les deux comptes, dans un sens ou dans l'autre. */
  blocked: boolean;
  /**
   * Une notification identique **non lue** existe déjà (même destinataire,
   * même acteur, même type, même cible).
   */
  hasUnreadIdentical: boolean;
};

export function shouldNotify(input: NotifyInput): boolean {
  // 1. Jamais pour ses propres gestes : aimer sa propre critique ne doit pas
  //    faire sonner sa propre cloche.
  if (input.actorId !== null && input.actorId === input.recipientId) {
    return false;
  }

  // 2. Jamais à travers un blocage. Le blocage coupe l'interaction ; une
  //    notification est une interaction.
  if (input.blocked) return false;

  // 3. Ne pas empiler une notification identique non lue. Retirer puis remettre
  //    un j'aime dix fois ne doit pas produire dix lignes.
  //
  //    Le critère est bien « non lue » : une notification déjà lue n'empêche
  //    pas la suivante, sinon un second j'aime, des semaines plus tard, ne se
  //    verrait jamais.
  if (input.hasUnreadIdentical) return false;

  return true;
}

/** Le verbe de chaque notification, à la première personne du destinataire. */
export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  FOLLOW: "s'est abonné à vous",
  FOLLOW_REQUEST: "demande à vous suivre",
  FOLLOW_ACCEPTED: "a accepté votre demande",
  LIKE: "a aimé",
  COMMENT: "a commenté",
  CORRECTION: "propose une correction",
  MODERATION: "Décision de modération",
};

/**
 * Une notification de ce type mène-t-elle à un contenu ?
 *
 * FOLLOW et FOLLOW_ACCEPTED mènent à un profil, pas à une cible sociale : la
 * distinction évite d'afficher un lien vide dans la boîte de réception.
 */
export function pointsToTarget(type: NotificationType): boolean {
  return type === "LIKE" || type === "COMMENT" || type === "MODERATION";
}
