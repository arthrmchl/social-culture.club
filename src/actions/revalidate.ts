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
