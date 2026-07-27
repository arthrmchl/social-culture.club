import "server-only";
import { db } from "@/lib/db";
import { typesForScope, yearBounds } from "./goals";
import type { GoalScope } from "@/generated/prisma/enums";

/**
 * Ce qui compte pour un objectif annuel (L5) — en un seul endroit, parce que
 * l'accueil et `/objectifs` doivent afficher le même chiffre.
 *
 * Règle : une **entrée de journal** datée dans l'année, sur une œuvre de la
 * portée, hors épisode. Consigner un film, une lecture ou une saison compte
 * pour un ; cocher vingt-quatre épisodes ne compte pas vingt-quatre fois, ce
 * qui rendrait tout objectif « séries » absurde. Les entrées sans date sont
 * exclues : elles n'appartiennent à aucune année.
 */
export async function countForGoal(
  userId: string,
  year: number,
  scope: GoalScope,
): Promise<number> {
  const { start, end } = yearBounds(year);

  return db.journalEntry.count({
    where: {
      userId,
      episodeId: null,
      loggedAt: { gte: start, lt: end },
      work: { type: { in: typesForScope(scope) } },
    },
  });
}

/** Les compteurs de plusieurs portées, en parallèle. */
export async function countForGoals(
  userId: string,
  year: number,
  scopes: GoalScope[],
): Promise<Record<string, number>> {
  const counts = await Promise.all(
    scopes.map((scope) => countForGoal(userId, year, scope)),
  );
  return Object.fromEntries(scopes.map((s, i) => [s, counts[i]]));
}
