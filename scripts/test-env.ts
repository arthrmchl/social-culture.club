/**
 * Configuration de l'environnement de test — point unique de vérité.
 *
 * Un module TypeScript versionné plutôt qu'un `.env.test` : `.gitignore` exclut
 * `.env*`, un fichier d'environnement de test ne serait donc pas partagé — soit
 * l'exact contraire du but recherché, le même environnement pour tout le monde
 * à chaque exécution.
 *
 * Rien ici ne doit jamais désigner la base de développement : le serveur de
 * test écoute sur un **autre port** (5433), dans un **autre conteneur**, sur un
 * tmpfs. Aucun `DROP` du harnais ne peut atteindre `scc`.
 */

/** Service et conteneur Docker dédiés (docker-compose.yml). */
export const TEST_DB_SERVICE = "db-test";
export const TEST_DB_CONTAINER = "scc-postgres-test";

export const TEST_DB_HOST = "localhost";
export const TEST_DB_PORT = 5433;
export const TEST_DB_USER = "scc";
export const TEST_DB_PASSWORD = "scc";
export const TEST_DB_NAME = "scc_test";

const CREDENTIALS = `${TEST_DB_USER}:${TEST_DB_PASSWORD}@${TEST_DB_HOST}:${TEST_DB_PORT}`;

/**
 * Base d'administration du serveur de test. `DROP DATABASE` ne peut pas
 * s'exécuter depuis sa propre cible : il faut une connexion à côté.
 */
export const TEST_ADMIN_URL = `postgresql://${CREDENTIALS}/postgres`;

/** La base que voient l'application, les migrations et les tests. */
export const TEST_DATABASE_URL = `postgresql://${CREDENTIALS}/${TEST_DB_NAME}?schema=public`;

/** Port du serveur Next lancé par Playwright — jamais 3000, laissé au dev. */
export const TEST_PORT = 3001;
export const TEST_BASE_URL = `http://${TEST_DB_HOST}:${TEST_PORT}`;

/** Visuels téléversés pendant les tests, effacés à chaque montage. */
export const TEST_UPLOADS_DIR = ".test-tmp/uploads";

/**
 * Répertoire de build distinct : sans lui, le serveur de test et un
 * `npm run dev` local se disputeraient `.next`.
 */
export const TEST_DIST_DIR = ".next-test";

/** Racine des fichiers jetables du harnais. */
export const TEST_TMP_DIR = ".test-tmp";

/**
 * Variables à injecter dans tout processus enfant devant parler à la base de
 * test. Elles priment sur `.env` : ni `dotenv` ni Next ne réécrivent une
 * variable déjà définie dans l'environnement — la base de développement ne peut
 * donc pas revenir par la bande.
 */
export function testEnv(): Record<string, string> {
  return {
    DATABASE_URL: TEST_DATABASE_URL,
    UPLOADS_DIR: TEST_UPLOADS_DIR,
    NEXT_DIST_DIR: TEST_DIST_DIR,
    BETTER_AUTH_URL: TEST_BASE_URL,
    NEXT_PUBLIC_APP_URL: TEST_BASE_URL,
    BETTER_AUTH_SECRET:
      process.env.BETTER_AUTH_SECRET ?? "test-secret-32-chars-minimum-please",
  };
}

/**
 * Garde-fou : refuse d'agir si l'URL visée n'est pas celle du serveur de test.
 * Appelée avant tout `DROP`/`CREATE DATABASE`.
 */
export function assertIsTestDatabase(url: string): void {
  const parsed = new URL(url);
  const name = parsed.pathname.replace(/^\//, "");
  if (parsed.port !== String(TEST_DB_PORT) || !name.endsWith("_test")) {
    throw new Error(
      `Refus d'opérer sur ${parsed.host}/${name} : le harnais de test n'agit ` +
        `que sur le port ${TEST_DB_PORT} et une base suffixée « _test ».`,
    );
  }
}
