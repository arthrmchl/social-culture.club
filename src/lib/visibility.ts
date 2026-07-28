/**
 * Règles de visibilité (lot 4, D25, D26, P5) — logique pure.
 *
 * C'est **le** point de sécurité du lot. Les lots 1 à 3 tiennent une règle
 * simple — toute lecture se referme sur `userId` — que le lot 4 inverse : la
 * lecture s'ouvre à d'autres. Elle ne doit donc s'ouvrir qu'en un seul endroit,
 * et cet endroit ne doit rien savoir de la base : ici, on décide ; dans
 * `src/lib/social/read.ts`, on applique.
 *
 * Aucune requête, aucun `server-only`, aucun effet de bord — donc une matrice
 * de cas exhaustivement testable (`visibility.test.ts`), ce qui est la seule
 * façon honnête de se convaincre qu'une règle de confidentialité tient.
 */

import type { ProfileVisibility } from "@/generated/prisma/enums";

/**
 * Qui regarde. `null` = visiteur déconnecté — un cas de premier ordre depuis
 * que les profils sont partageables par lien, pas une dégradation.
 */
export type Viewer = { id: string; isAdmin: boolean } | null;

/** Ce qu'il faut savoir de l'auteur pour décider. Rien de plus. */
export type AuthorProfile = {
  id: string;
  visibility: ProfileVisibility;
  showJournalPublicly: boolean;
  showStatsPublicly: boolean;
  banned: boolean;
};

/** Ce que le visiteur est vis-à-vis de l'auteur, déjà chargé par l'appelant. */
export type Relation = {
  isSelf: boolean;
  /** Abonnement **ACCEPTED** du visiteur vers l'auteur. Un PENDING ne compte pas. */
  followsAuthor: boolean;
  /** Blocage dans un sens **ou** dans l'autre — le blocage est symétrique à l'usage. */
  blockEitherWay: boolean;
};

export type AccessReason = "blocked" | "private" | "members-only" | "banned";

export type Access = {
  canSeeProfile: boolean;
  canSeeJournal: boolean;
  canSeeLists: boolean;
  canSeeReviews: boolean;
  canSeeStats: boolean;
  canSeeFollowGraph: boolean;
  /** J'aime, commentaire, abonnement. */
  canInteract: boolean;
  /**
   * Pourquoi c'est fermé. Ne jamais rendre tel quel à un visiteur : distinguer
   * « privé » de « bloqué » dirait au bloqué qu'il l'est. Sert à choisir un
   * libellé côté auteur et à la vérification.
   */
  reason: AccessReason | null;
};

const CLOSED = (reason: AccessReason): Access => ({
  canSeeProfile: false,
  canSeeJournal: false,
  canSeeLists: false,
  canSeeReviews: false,
  canSeeStats: false,
  canSeeFollowGraph: false,
  canInteract: false,
  reason,
});

/**
 * Ce que ce visiteur peut voir de cet auteur.
 *
 * L'ordre des règles n'est pas négociable :
 *
 * 1. **Blocage** — tout se ferme, y compris pour l'administrateur. La
 *    modération se fait depuis `/moderation`, pas en contournant un blocage sur
 *    une page de profil ; laisser l'admin passer ferait de son compte une porte
 *    dérobée à chaque blocage.
 * 2. **Soi-même** — on se voit toujours entièrement, quelle que soit sa propre
 *    visibilité.
 * 3. **Administrateur** — voit tout, mais `canInteract` reste soumis aux règles
 *    normales : modérer n'est pas commenter.
 * 4. **Compte banni** — invisible de tous sauf de l'administrateur (règle 3,
 *    évaluée avant).
 * 5. **PRIVATE** exige un abonnement accepté ; **MEMBERS** exige une session ;
 *    **PUBLIC** passe même déconnecté.
 * 6. Puis les restrictions par section, qui ne peuvent que **retrancher**.
 */
export function resolveAccess(
  viewer: Viewer,
  author: AuthorProfile,
  rel: Relation,
): Access {
  if (rel.blockEitherWay) return CLOSED("blocked");

  if (rel.isSelf) {
    return {
      canSeeProfile: true,
      canSeeJournal: true,
      canSeeLists: true,
      canSeeReviews: true,
      canSeeStats: true,
      canSeeFollowGraph: true,
      // On n'interagit pas avec soi-même : ni s'abonner, ni s'auto-notifier.
      canInteract: false,
      reason: null,
    };
  }

  if (viewer?.isAdmin) {
    return {
      canSeeProfile: true,
      canSeeJournal: true,
      canSeeLists: true,
      canSeeReviews: true,
      canSeeStats: true,
      canSeeFollowGraph: true,
      canInteract: !author.banned,
      reason: null,
    };
  }

  if (author.banned) return CLOSED("banned");

  switch (author.visibility) {
    case "PRIVATE":
      if (!rel.followsAuthor) return CLOSED("private");
      break;
    case "MEMBERS":
      if (!viewer) return CLOSED("members-only");
      break;
    case "PUBLIC":
      break;
  }

  return {
    canSeeProfile: true,
    // Les deux drapeaux de section ne peuvent que restreindre : la visibilité
    // effective est `min(compte, section)`. C'est pourquoi ce sont des booléens
    // et non un second énuméré — « journal public sur compte privé » n'a pas de
    // sens et ne doit pas être représentable.
    canSeeJournal: author.showJournalPublicly,
    canSeeLists: true,
    canSeeReviews: author.showJournalPublicly,
    canSeeStats: author.showStatsPublicly,
    canSeeFollowGraph: true,
    // Interagir demande une session : un visiteur déconnecté lit, il ne pose
    // rien.
    canInteract: viewer !== null,
    reason: null,
  };
}

/** Un contenu daté, tel que la couche de lecture le connaît. */
export type VisibleContent = {
  /** Masquage par la modération (D25). */
  hiddenAt: Date | null;
  /** Retrait par l'auteur (P5) — n'existe que sur les listes. */
  isPrivate?: boolean;
};

/**
 * Ce contenu précis est-il affichable ?
 *
 * `access` dit ce que le visiteur peut voir de l'auteur ; cette fonction ajoute
 * ce que le contenu lui-même autorise. Le propriétaire et l'administrateur
 * voient un contenu masqué — on ne fait pas disparaître un écrit sans le dire à
 * celui qui l'a écrit ; c'est la vue qui l'affiche coiffé d'un bandeau.
 */
export function canSeeContent(
  access: Pick<Access, "canSeeProfile">,
  content: VisibleContent,
  isOwnerOrAdmin: boolean,
): boolean {
  if (isOwnerOrAdmin) return true;
  if (!access.canSeeProfile) return false;
  if (content.hiddenAt !== null) return false;
  return content.isPrivate !== true;
}

/** Libellés des trois visibilités, pour la page de confidentialité. */
export const VISIBILITY_LABELS: Record<ProfileVisibility, string> = {
  PUBLIC: "Public",
  MEMBERS: "Membres de l'instance",
  PRIVATE: "Privé",
};

export const VISIBILITY_HINTS: Record<ProfileVisibility, string> = {
  PUBLIC:
    "Votre profil est consultable par lien, même sans compte. C'est le réglage qui permet de partager une liste ou une critique.",
  MEMBERS:
    "Votre profil n'est visible que des membres connectés de l'instance. Un lien partagé à l'extérieur ne montrera rien.",
  PRIVATE:
    "Votre profil n'est visible que des membres dont vous avez approuvé l'abonnement. Les nouvelles demandes vous sont soumises.",
};

export const VISIBILITY_ORDER: ProfileVisibility[] = [
  "PUBLIC",
  "MEMBERS",
  "PRIVATE",
];
