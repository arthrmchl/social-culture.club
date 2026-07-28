import { revalidatePath } from "next/cache";

/**
 * Les vues qu'une mutation de suivi rend caduques.
 *
 * Le helper était recopié dans `status.ts`, `journal.ts` et `progress.ts`, avec
 * des listes de chemins qui avaient déjà divergé — `progress.ts` oubliait
 * `/watchlist`. Le lot 3 en ajoute une quatrième (`/bibliotheque`) : autant en
 * faire un point unique avant que l'écart ne se creuse.
 *
 * Ce module n'est pas un fichier de server actions : il n'exporte que des
 * fonctions synchrones, appelées depuis les actions après leur transaction.
 */
export function revalidateWork(workId: string): void {
  revalidatePath(`/oeuvre/${workId}`);
  revalidatePath("/");
  revalidatePath("/journal");
  revalidatePath("/watchlist");
  revalidatePath("/bibliotheque");
}

/** Les vues d'une liste — la liste elle-même et les index qui la citent. */
export function revalidateLists(slug?: string): void {
  revalidatePath("/listes");
  if (slug) revalidatePath(`/listes/${slug}`);
  revalidatePath("/");
}

/**
 * Les vues d'un profil public (lot 4).
 *
 * `username` est nullable en base : sans pseudonyme, il n'y a pas d'URL à
 * purger, et l'appel est sans effet plutôt que d'échouer.
 *
 * Rappel qui vaut pour tout ce qui suit : `revalidatePath` purge **par
 * chemin**, jamais par visiteur. Ces appels servent la fraîcheur, pas la
 * confidentialité — celle-ci est tenue par `src/lib/social/read.ts` et par le
 * `force-dynamic` du groupe `(public)`.
 */
export function revalidateProfile(username: string | null): void {
  revalidatePath("/profil");
  revalidatePath("/confidentialite");
  revalidatePath("/abonnements");
  if (!username) return;
  revalidatePath(`/u/${username}`);
  revalidatePath(`/u/${username}/journal`);
  revalidatePath(`/u/${username}/critiques`);
  revalidatePath(`/u/${username}/listes`);
  revalidatePath(`/u/${username}/abonnes`);
  revalidatePath(`/u/${username}/abonnements`);
}

/** Le fil et la page « découvrir » (lot 4, P2). */
export function revalidateFeed(): void {
  revalidatePath("/fil");
  revalidatePath("/decouvrir");
}
