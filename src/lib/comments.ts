/**
 * Commentaires (lot 4, P3) — logique pure.
 *
 * Fil **plat** en v1 : pas de `parentId`, décision assumée du cahier des
 * charges. Les constantes vivent avec la logique, comme `MAX_FAVORITES` au
 * lot 3 — l'action les importe plutôt que de les redéfinir.
 */

export const MAX_COMMENT_LENGTH = 2000;

/** Plafond anti-spam technique, pas de la modération de contenu (D25). */
export const MAX_COMMENTS_PER_MINUTE = 10;

export const COMMENT_EMPTY = "Le commentaire ne peut pas être vide.";
export const COMMENT_TOO_LONG = `Le commentaire ne peut pas dépasser ${MAX_COMMENT_LENGTH} caractères.`;
export const COMMENT_TOO_FAST =
  "Vous publiez trop vite. Reprenez dans une minute.";

/**
 * Nettoie un corps de commentaire avant écriture.
 *
 * Les sauts de ligne sont normalisés en `\n` (un copier-coller depuis Windows
 * apporte des `\r\n` qui feraient dérailler le rendu markdown), et les lignes
 * vides successives sont ramenées à une seule — on ne pousse pas le contenu
 * suivant hors de l'écran avec quarante retours chariot.
 */
export function normalizeCommentBody(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type CommentValidation =
  | { ok: true; body: string }
  | { ok: false; error: string };

/** Valide un corps de commentaire. La longueur se mesure **après** nettoyage. */
export function validateCommentBody(raw: string): CommentValidation {
  const body = normalizeCommentBody(raw);
  if (!body) return { ok: false, error: COMMENT_EMPTY };
  if (body.length > MAX_COMMENT_LENGTH) {
    return { ok: false, error: COMMENT_TOO_LONG };
  }
  return { ok: true, body };
}

/** « 3 commentaires », « Aucun commentaire » — le pluriel en un seul endroit. */
export function describeComments(count: number): string {
  if (count === 0) return "Aucun commentaire";
  return `${count} commentaire${count > 1 ? "s" : ""}`;
}

/** Idem pour les j'aime. */
export function describeLikes(count: number): string {
  if (count === 0) return "Aucun j'aime";
  return `${count} j'aime`;
}
