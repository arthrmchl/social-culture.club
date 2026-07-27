/**
 * Restauration d'une sauvegarde (I5) — l'autre moitié de scripts/backup.ts.
 *
 * Une sauvegarde qu'on n'a jamais restaurée ne vaut rien : ce script existe
 * pour rendre l'exercice trivial, donc régulier.
 *
 * Usage : npm run restore -- <fichier.dump> --yes
 *         npm run restore                      (liste les sauvegardes)
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, openSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const BACKUPS_DIR = path.resolve(process.env.BACKUPS_DIR ?? "./backups");
const CONTAINER = process.env.BACKUP_PG_CONTAINER ?? "scc-postgres";

function parseDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL manquant.");
  const url = new URL(raw);
  return {
    user: decodeURIComponent(url.username),
    name: url.pathname.replace(/^\//, ""),
    host: url.hostname,
    port: url.port || "5432",
  };
}

function containerRunning(): boolean {
  try {
    const out = execFileSync(
      "docker",
      ["ps", "--filter", `name=^${CONTAINER}$`, "--format", "{{.Names}}"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return out.trim() === CONTAINER;
  } catch {
    return false;
  }
}

function listBackups(): string[] {
  if (!existsSync(BACKUPS_DIR)) return [];
  return readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith(".dump"))
    .sort()
    .reverse();
}

function main(): void {
  const args = process.argv.slice(2);
  const confirmed = args.includes("--yes");
  const target = args.find((a) => !a.startsWith("--"));

  if (!target) {
    const backups = listBackups();
    console.log("── Sauvegardes disponibles ───────────────────");
    if (backups.length === 0) {
      console.log(`  aucune dans ${BACKUPS_DIR}`);
    } else {
      for (const b of backups) {
        const file = path.join(BACKUPS_DIR, b);
        console.log(`  ${b}  (${statSync(file).mtime.toISOString().slice(0, 16)})`);
      }
    }
    console.log("\nUsage : npm run restore -- <fichier.dump> --yes");
    return;
  }

  const file = path.isAbsolute(target) ? target : path.resolve(target);
  if (!existsSync(file)) throw new Error(`Fichier introuvable : ${file}`);

  const db = parseDatabaseUrl();

  if (!confirmed) {
    console.log("── Restauration ──────────────────────────────");
    console.log(`  source : ${file}`);
    console.log(`  cible  : ${db.name} sur ${db.host}:${db.port}`);
    console.log(
      "\n⚠️  Cette opération ÉCRASE le contenu actuel de la base." +
        "\n   Relancez avec --yes pour confirmer.",
    );
    process.exit(1);
  }

  console.log(`Restauration de ${path.basename(file)} vers ${db.name}…`);

  const args2 = [
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-acl",
    "--dbname",
    db.name,
  ];

  if (containerRunning()) {
    execFileSync(
      "docker",
      ["exec", "-i", CONTAINER, "pg_restore", "--username", db.user, ...args2],
      { stdio: [openRead(file), "inherit", "inherit"] },
    );
  } else {
    execFileSync(
      resolvePgRestore(),
      ["--host", db.host, "--port", db.port, "--username", db.user, ...args2],
      { stdio: [openRead(file), "inherit", "inherit"] },
    );
  }

  console.log(
    "\n✅ Restauration terminée." +
      "\n   Pensez à restaurer aussi l'archive des visuels correspondante :" +
      "\n   tar -xzf uploads-<horodatage>.tar.gz -C .",
  );
}

function openRead(file: string): number {
  return openSync(file, "r");
}

/** Voir la note de scripts/backup.ts : les outils clients ne sont pas toujours dans le PATH. */
function resolvePgRestore(): string {
  if (process.env.PG_RESTORE) return process.env.PG_RESTORE;

  const candidates = [
    "/opt/homebrew/bin/pg_restore",
    "/opt/homebrew/opt/postgresql@17/bin/pg_restore",
    "/usr/local/bin/pg_restore",
    "/usr/bin/pg_restore",
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }

  try {
    execFileSync("pg_restore", ["--version"], { stdio: "ignore" });
    return "pg_restore";
  } catch {
    throw new Error(
      "pg_restore introuvable — installez les outils clients PostgreSQL " +
        "ou indiquez le binaire : PG_RESTORE=/chemin/vers/pg_restore npm run restore",
    );
  }
}

try {
  main();
} catch (e) {
  console.error("\n❌ Échec de la restauration");
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
