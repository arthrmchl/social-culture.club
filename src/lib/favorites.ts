/**
 * Favoris de profil (lot 3, S11) — constantes partagées.
 *
 * Vit dans `lib/` et non dans l'action : un fichier « use server » ne peut
 * exporter que des fonctions asynchrones, et l'interface a besoin du plafond
 * pour désactiver le bouton au bon moment.
 */

/** Quatre œuvres en tête de profil, tous médias confondus — le geste Letterboxd. */
export const MAX_FAVORITES = 4;

export const FAVORITES_FULL = `Vous avez déjà ${MAX_FAVORITES} favoris. Retirez-en un avant d'en ajouter un autre.`;
