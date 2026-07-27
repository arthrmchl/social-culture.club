/**
 * Listes personnelles (lot 3, S9, D11) — logique pure.
 *
 * Les positions sont **toujours** tenues, qu'une liste soit ordonnée ou non :
 * `isRanked` ne pilote que l'affichage. Une seule forme de stockage, deux
 * rendus — et le jour où l'on bascule une liste en classement, l'ordre d'ajout
 * fait un point de départ honnête.
 */

export type Positioned = { id: string; position: number };

/** Position du prochain élément ajouté — à la fin, sans trou. */
export function nextPosition(items: { position: number }[]): number {
  if (items.length === 0) return 0;
  return Math.max(...items.map((i) => i.position)) + 1;
}

/**
 * Déplace un élément à l'index voulu et renvoie **les seules lignes dont la
 * position change**. Renvoyer la liste entière obligerait à réécrire vingt
 * lignes pour en bouger une.
 *
 * L'index cible est ramené dans les bornes ; déplacer un élément sur sa propre
 * place ne produit aucune écriture.
 */
export function reorderPositions<T extends Positioned>(
  items: T[],
  id: string,
  toIndex: number,
): Positioned[] {
  const ordered = [...items].sort((a, b) => a.position - b.position);
  const from = ordered.findIndex((i) => i.id === id);
  if (from === -1) return [];

  const to = Math.max(0, Math.min(ordered.length - 1, Math.trunc(toIndex)));
  if (to === from) return [];

  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);

  // Positions renumérotées de 0 à n-1 : on ne laisse jamais l'ordre dépendre
  // d'écarts hérités d'une suppression.
  const changed: Positioned[] = [];
  ordered.forEach((item, index) => {
    if (item.position !== index) changed.push({ id: item.id, position: index });
  });
  return changed;
}

/**
 * Renumérotation compacte après une suppression : mêmes règles, appliquées à
 * ce qui reste.
 */
export function compactPositions<T extends Positioned>(items: T[]): Positioned[] {
  const ordered = [...items].sort((a, b) => a.position - b.position);
  const changed: Positioned[] = [];
  ordered.forEach((item, index) => {
    if (item.position !== index) changed.push({ id: item.id, position: index });
  });
  return changed;
}

/** Résumé d'une liste : « 12 œuvres · classement ». */
export function describeList(count: number, isRanked: boolean): string {
  const works = count === 0 ? "Vide" : `${count} œuvre${count > 1 ? "s" : ""}`;
  return isRanked ? `${works} · classement` : works;
}
