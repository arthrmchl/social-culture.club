import { Pool } from "pg";
import { TEST_DATABASE_URL, assertIsTestDatabase } from "../scripts/test-env";

/**
 * Garde d'entrée des scénarios e2e.
 *
 * Ce fichier purgeait jusqu'ici l'état social des comptes seedés, faute de quoi
 * la seconde exécution ne retrouvait plus le bouton « Suivre ». Cette purge n'a
 * plus lieu d'être : `scripts/with-test-db.ts` monte une base **neuve** à
 * chaque exécution et la détruit ensuite. Purger un état qui n'existe pas
 * masquerait au contraire une base mal montée.
 *
 * Ne reste donc qu'une vérification : sommes-nous bien sur la base de test, et
 * porte-t-elle son jeu de fixtures ? Un `playwright test` lancé à la main sans
 * le harnais doit échouer ici, immédiatement et lisiblement — et non trente
 * secondes plus tard sur un sélecteur introuvable.
 */
export default async function globalSetup() {
  const url = process.env.DATABASE_URL;
  if (url !== TEST_DATABASE_URL) {
    throw new Error(
      "Les tests e2e ne s'exécutent que contre la base de test.\n" +
        "Lancer `npm run test:e2e`, et non `playwright test` directement.",
    );
  }
  assertIsTestDatabase(url);

  const pool = new Pool({ connectionString: url });
  try {
    const { rows } = await pool.query<{ users: string; works: string; invites: string }>(
      `SELECT (SELECT count(*) FROM "user")                          AS users,
              (SELECT count(*) FROM "Work")                          AS works,
              (SELECT count(*) FROM "Invitation" WHERE code = 'SCC-E2E-0001') AS invites`,
    );
    const { users, works, invites } = rows[0]!;
    if (Number(users) < 2 || Number(works) < 3 || Number(invites) < 1) {
      throw new Error(
        `Base de test incomplète (${users} comptes, ${works} œuvres, ${invites} invitation).\n` +
          "Remonter le harnais : `npm run db:test:down` puis `npm run test:e2e`.",
      );
    }
  } finally {
    await pool.end();
  }
}
