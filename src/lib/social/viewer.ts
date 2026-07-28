import "server-only";

import { cache } from "react";
import { getCurrentSession, isAdmin } from "@/lib/session";
import type { Viewer } from "@/lib/visibility";
import { accessFor, accessForUsername, type AccessTo } from "./access";

/**
 * Qui regarde (lot 4).
 *
 * Séparé d'`access.ts` pour une raison précise : `src/lib/session.ts` importe
 * `next/navigation`, qui ne se charge pas sous la condition `react-server` de
 * `scripts/verify.ts`. En isolant la lecture de session ici, la couche de
 * décision reste exerçable hors requête HTTP — et une règle de confidentialité
 * vérifiée sur le vrai chemin vaut mieux qu'une réimplémentation.
 *
 * Les pages appellent donc `accessTo` / `accessToUsername` ; la vérification et
 * les actions appellent `accessFor`, à qui elles fournissent le visiteur.
 */

/** Le visiteur courant — `null` s'il n'est pas connecté, cas de premier ordre. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const session = await getCurrentSession();
  if (!session) return null;
  return { id: session.user.id, isAdmin: isAdmin(session.user) };
});

export const accessTo = cache(
  async (authorId: string): Promise<AccessTo | null> =>
    accessFor(await getViewer(), authorId),
);

export const accessToUsername = cache(
  async (username: string): Promise<AccessTo | null> =>
    accessForUsername(await getViewer(), username),
);
