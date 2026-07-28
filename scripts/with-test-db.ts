/**
 * Exécute une commande contre une base de test neuve, puis la détruit.
 *
 *   npx tsx scripts/with-test-db.ts -- playwright test
 *   npx tsx scripts/with-test-db.ts -- tsx --conditions=react-server scripts/verify.ts
 *
 * La destruction est dans un `finally` : elle a lieu que la commande réussisse,
 * échoue ou soit interrompue. `KEEP_TEST_DB=1` la saute et laisse la base
 * debout pour inspection.
 *
 * Ce fichier n'importe **aucun module `server-only`** : `--conditions=react-server`
 * ne vaut que pour le processus enfant, jamais pour ce wrapper.
 */
import { spawn } from "node:child_process";
import { TEST_DATABASE_URL, testEnv } from "./test-env";
import { up, down } from "./test-db";

function parseCommand(): string[] {
  const argv = process.argv.slice(2);
  const sep = argv.indexOf("--");
  const cmd = sep === -1 ? argv : argv.slice(sep + 1);
  if (cmd.length === 0) {
    console.error("Usage : tsx scripts/with-test-db.ts -- <commande…>");
    process.exit(1);
  }
  return cmd;
}

/** Lance la commande et renvoie son code de sortie. */
function runChild(cmd: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd[0]!, cmd.slice(1), {
      stdio: "inherit",
      env: { ...process.env, ...testEnv() },
    });
    child.on("error", reject);
    child.on("close", (code, signal) =>
      resolve(signal ? 1 : (code ?? 1)),
    );
  });
}

async function main() {
  const cmd = parseCommand();

  // Sans ces écouteurs, un Ctrl-C tuerait ce processus avant le `finally` et
  // laisserait le conteneur debout. L'enfant reçoit le même signal et s'arrête
  // de lui-même ; il ne reste qu'à attendre sa sortie.
  const onSignal = () => {};
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  let code = 1;
  await up();
  try {
    code = await runChild(cmd);
  } finally {
    if (process.env.KEEP_TEST_DB === "1") {
      console.log(`ℹ️  Base de test conservée : ${TEST_DATABASE_URL}`);
      console.log("   La détruire ensuite : npm run db:test:down");
    } else {
      await down();
    }
  }
  process.exit(code);
}

main().catch(async (e) => {
  console.error(e);
  if (process.env.KEEP_TEST_DB !== "1") await down().catch(() => {});
  process.exit(1);
});
