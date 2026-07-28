import { defineConfig, devices } from "@playwright/test";
import {
  TEST_BASE_URL,
  TEST_PORT,
  TEST_DIST_DIR,
  testEnv,
} from "./scripts/test-env";

/**
 * Les scénarios e2e ne s'exécutent jamais contre la base de développement :
 * `npm run test:e2e` passe par `scripts/with-test-db.ts`, qui monte une base
 * neuve puis la détruit. Playwright lance ici l'application **lui-même**, sur
 * le port 3001 et branchée sur cette base — un `npm run dev` local sur :3000
 * peut continuer à tourner sans interférer.
 *
 * Pas de `dotenv` : la configuration de test est un module versionné
 * (`scripts/test-env.ts`), et `.env` n'a rien à dire ici.
 *
 * `next dev` et non `next build && next start` : la vérification porte sur le
 * comportement, pas sur la compilation de production, et une build complète à
 * chaque exécution coûterait plus cher que tout le reste du harnais.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // Séquentiel : les scénarios partagent une base et un catalogue. `lot0`
  // consomme l'invitation SCC-E2E-0001, les autres s'appuient sur le catalogue
  // de fixtures — l'ordre alphabétique des fichiers fait foi.
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: TEST_BASE_URL,
    headless: true,
    trace: "off",
  },
  webServer: {
    command: `npx next dev --port ${TEST_PORT}`,
    url: TEST_BASE_URL,
    // Jamais de réutilisation : un serveur déjà en place parlerait à une autre
    // base — très probablement celle de développement.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...testEnv(), NEXT_DIST_DIR: TEST_DIST_DIR },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
