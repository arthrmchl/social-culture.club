/**
 * Le fil d'activité (lot 4, P2) — logique pure.
 *
 * Le fil fusionne trois sources : entrées de journal, critiques d'œuvres,
 * listes. Pas de table `Activity` dénormalisée en v1 — elle doublerait tous les
 * chemins d'écriture existants (journal, critique, liste, import) et exigerait
 * une reprise des données du lot 2. En cercle privé (D24), trois requêtes
 * indexées coûtent moins qu'un système de propagation à maintenir. Et comme
 * `getFeed()` est la porte unique, basculer plus tard ne change qu'un fichier.
 *
 * Tout ce qui suit est pur et testé, parce que deux règles s'y jouent qu'on ne
 * veut pas voir dériver dans un `.filter()` au fil d'une page : l'ordre de
 * fusion et la déduplication critique/entrée.
 */

export const FEED_PAGE_SIZE = 20;

export type FeedAuthor = {
  id: string;
  name: string;
  username: string | null;
  image: string | null;
};

/**
 * Un élément de fil.
 *
 * `at` est la date de **publication**, jamais la date de consommation : une
 * entrée antidatée à 2011 n'est pas une actualité de 2011. C'est aussi la seule
 * grandeur commune aux trois sources, donc la seule sur laquelle un curseur
 * puisse être cohérent.
 */
export type FeedItem = {
  kind: "entry" | "review" | "list";
  id: string;
  authorId: string;
  at: Date;
  /** Œuvre concernée — absente pour une liste. */
  workId: string | null;
  /** Texte publié, s'il y en a un. Sert à la déduplication. */
  text: string | null;
};

/**
 * Fusionne des sources déjà triées, du plus récent au plus ancien.
 *
 * L'identifiant départage les ex æquo : sans cela, deux éléments de même
 * horodatage pourraient s'inverser d'une page à l'autre et l'un des deux
 * disparaîtrait du fil.
 */
export function mergeFeed(sources: FeedItem[][], limit: number): FeedItem[] {
  const all = sources.flat();
  all.sort((a, b) => {
    const d = b.at.getTime() - a.at.getTime();
    return d !== 0 ? d : b.id.localeCompare(a.id);
  });
  return all.slice(0, limit);
}

/** Normalise un texte pour la comparaison : espaces compactés, casse ignorée. */
function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
}

/**
 * Écarte la critique d'œuvre quand elle répète mot pour mot une entrée de
 * journal du même auteur sur la même œuvre.
 *
 * Le doublon est structurel : `UserWork.reviewText` (la critique attachée à
 * l'œuvre, S7) et `JournalEntry.reviewText` (celle attachée au visionnage)
 * contiennent très souvent le même texte, et l'import Letterboxd alimente les
 * deux. Sans arbitrage, le fil dirait deux fois la même chose.
 *
 * Quatre règles, dans cet ordre :
 *
 * 1. **Texte identique → l'entrée de journal gagne.** Elle est plus riche :
 *    date de consommation, sous-unité, revisionnage, étiquettes, contexte. La
 *    critique d'œuvre n'apporte alors rien de plus.
 * 2. **Textes différents → on garde les deux.** Ce sont deux écrits distincts
 *    (« mon avis sur la série » et « ce que j'ai pensé de la saison 3 ») ; les
 *    fusionner effacerait de l'information.
 * 3. **Jamais de déduplication par proximité temporelle.** L'égalité de texte
 *    est le seul signal honnête ; une heuristique « posté dans les 5 minutes »
 *    masquerait des critiques légitimes.
 * 4. **Une critique sans texte ne dédoublonne rien** — il n'y a pas d'égalité
 *    à constater.
 */
export function dedupeReviewAndEntry(items: FeedItem[]): FeedItem[] {
  // Les textes des entrées, par (auteur, œuvre).
  const entryTexts = new Map<string, Set<string>>();
  for (const item of items) {
    if (item.kind !== "entry" || !item.text || !item.workId) continue;
    const key = `${item.authorId}:${item.workId}`;
    const set = entryTexts.get(key) ?? new Set<string>();
    set.add(normalizeText(item.text));
    entryTexts.set(key, set);
  }

  return items.filter((item) => {
    if (item.kind !== "review" || !item.text || !item.workId) return true;
    const key = `${item.authorId}:${item.workId}`;
    return !entryTexts.get(key)?.has(normalizeText(item.text));
  });
}

/** Le curseur d'une page : la date et l'identifiant du dernier élément servi. */
export type FeedCursor = { at: Date; id: string };

export function encodeCursor(item: FeedItem): string {
  return `${item.at.toISOString()}|${item.id}`;
}

/**
 * Décode un curseur. **Ne lève jamais** : une valeur bricolée à la main est
 * ramenée au défaut (première page), comme `parseLibraryQuery` au lot 3. Une
 * URL malmenée n'a pas à produire d'erreur.
 */
export function decodeCursor(raw: string | undefined | null): FeedCursor | null {
  if (!raw) return null;
  const sep = raw.indexOf("|");
  if (sep <= 0) return null;

  const at = new Date(raw.slice(0, sep));
  if (Number.isNaN(at.getTime())) return null;

  const id = raw.slice(sep + 1);
  return id ? { at, id } : null;
}

export type FeedPage = {
  items: FeedItem[];
  /** Curseur de la page suivante, `null` s'il n'y a plus rien. */
  nextCursor: string | null;
};

/**
 * Assemble une page à partir des sources brutes.
 *
 * Chaque source ramène `limit + 1` éléments antérieurs au curseur ; on fusionne,
 * on déduplique, puis on coupe. La déduplication passe **avant** la coupe :
 * une page peut donc rendre moins de `limit` éléments. C'est accepté et dit
 * plutôt que compensé par une boucle de re-fetch, qui compliquerait le curseur
 * pour un gain cosmétique.
 */
export function buildFeedPage(
  sources: FeedItem[][],
  limit = FEED_PAGE_SIZE,
): FeedPage {
  const merged = dedupeReviewAndEntry(mergeFeed(sources, limit + 1));
  const items = merged.slice(0, limit);
  const last = items[items.length - 1];

  return {
    items,
    nextCursor: merged.length > items.length && last ? encodeCursor(last) : null,
  };
}
