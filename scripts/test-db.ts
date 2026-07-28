/**
 * Cycle de vie de la base de test : `up` la monte à neuf, `down` la détruit.
 *
 * Usage direct (dépannage) :
 *   npx tsx scripts/test-db.ts up
 *   npx tsx scripts/test-db.ts down
 *
 * En temps normal, c'est `scripts/with-test-db.ts` qui l'appelle autour d'une
 * commande. Rien ici ne connaît la base de développement : le serveur visé est
 * un conteneur distinct sur le port 5433, et `assertIsTestDatabase` refuse
 * toute autre cible avant le moindre `DROP`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import {
  TEST_ADMIN_URL,
  TEST_DATABASE_URL,
  TEST_DB_NAME,
  TEST_DB_SERVICE,
  TEST_TMP_DIR,
  TEST_UPLOADS_DIR,
  assertIsTestDatabase,
  testEnv,
} from "./test-env";

const ROOT = path.resolve(import.meta.dirname, "..");

function run(cmd: string, args: string[], env: Record<string, string> = {}) {
  execFileSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

/**
 * Attend que le serveur accepte les connexions. Une boucle de connexion `pg`
 * plutôt que `pg_isready` : ce binaire n'est pas garanti sur la machine hôte,
 * et c'est de toute façon la connexion qui nous intéresse, pas le processus.
 */
async function waitForPostgres(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const client = new Client({ connectionString: TEST_ADMIN_URL });
    try {
      await client.connect();
      await client.end();
      return;
    } catch (e) {
      lastError = e;
      await client.end().catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(
    `Le serveur de test n'a pas répondu en ${timeoutMs / 1000} s : ${String(lastError)}`,
  );
}

/** Repart d'une base vide. `WITH (FORCE)` déloge une connexion oubliée. */
async function recreateDatabase(): Promise<void> {
  assertIsTestDatabase(TEST_DATABASE_URL);
  const client = new Client({ connectionString: TEST_ADMIN_URL });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
  } finally {
    await client.end();
  }
}

export async function up(): Promise<void> {
  console.log("▶︎ Base de test : montage…");
  run("docker", ["compose", "up", "-d", TEST_DB_SERVICE]);
  await waitForPostgres();
  await recreateDatabase();

  // Le client Prisma est gitignoré : un clone frais n'en a pas.
  if (!existsSync(path.join(ROOT, "src/generated/prisma"))) {
    run("npx", ["prisma", "generate"]);
  }

  // `migrate deploy` et non `migrate dev` : on applique les migrations telles
  // qu'elles sont versionnées, sans jamais en écrire une nouvelle. L'extension
  // pg_trgm et son index GIN viennent avec — `scc` est superutilisateur dans le
  // conteneur, `CREATE EXTENSION` passe.
  run("npx", ["prisma", "migrate", "deploy"], testEnv());
  run("npx", ["tsx", "prisma/seed.ts"], testEnv());
  run("npx", ["tsx", "prisma/fixtures.ts"], testEnv());

  // Les visuels téléversés pendant les tests, à part de `uploads/`.
  const uploads = path.join(ROOT, TEST_UPLOADS_DIR);
  rmSync(uploads, { recursive: true, force: true });
  mkdirSync(uploads, { recursive: true });

  console.log(`✅ Base de test prête : ${TEST_DATABASE_URL}`);
}

export async function down(): Promise<void> {
  // `rm -sf` plutôt que `compose down` : ne touche que ce service, jamais le
  // conteneur de développement. Le tmpfs emporte les données avec lui.
  try {
    run("docker", ["compose", "rm", "-sf", TEST_DB_SERVICE]);
  } catch {
    console.warn("⚠️  Arrêt du conteneur de test impossible — le vérifier à la main.");
    return;
  }
  rmSync(path.join(ROOT, TEST_TMP_DIR), { recursive: true, force: true });
  console.log("✅ Base de test détruite");
}

if (import.meta.filename === process.argv[1]) {
  const action = process.argv[2];
  const task = action === "up" ? up : action === "down" ? down : null;
  if (!task) {
    console.error("Usage : tsx scripts/test-db.ts <up|down>");
    process.exit(1);
  }
  task().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
