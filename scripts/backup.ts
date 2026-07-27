/**
 * Sauvegarde de la base et des visuels (I5).
 *
 * Deux artefacts par sauvegarde : un dump PostgreSQL au format personnalisé
 * et une archive des visuels téléversés. Les deux vont ensemble — une base
 * sans ses visuels laisse un catalogue aveugle (N4).
 *
 * Usage : npm run backup
 *
 * Le dump passe par `docker compose exec` quand la base tourne en conteneur :
 * `pg_dump` refuse de dialoguer avec un serveur plus récent que lui, et la
 * version du client local n'a aucune raison de suivre celle du conteneur.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";

const BACKUPS_DIR = path.resolve(process.env.BACKUPS_DIR ?? "./backups");
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? "./uploads");
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS ?? 14);
const CONTAINER = process.env.BACKUP_PG_CONTAINER ?? "scc-postgres";

type Db = { user: string; name: string; host: string; port: string };

function parseDatabaseUrl(): Db {
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

/** Le conteneur Docker attendu tourne-t-il ? */
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

function timestamp(now = new Date()): string {
  return now.toISOString().replace(/[:T]/g, "-").slice(0, 16);
}

function dumpDatabase(db: Db, target: string): void {
  const args = ["--format=custom", "--no-owner", "--no-acl", "--dbname", db.name];

  if (containerRunning()) {
    console.log(`  base   : via le conteneur ${CONTAINER}`);
    execFileSync(
      "docker",
      ["exec", "-i", CONTAINER, "pg_dump", "--username", db.user, ...args],
      { stdio: ["ignore", openWrite(target), "inherit"] },
    );
    return;
  }

  const pgDump = resolvePgDump();
  console.log(`  base   : via ${pgDump} (${db.host}:${db.port})`);
  execFileSync(
    pgDump,
    ["--host", db.host, "--port", db.port, "--username", db.user, ...args],
    { stdio: ["ignore", openWrite(target), "inherit"] },
  );
}

/**
 * Chemin de `pg_dump`. Les outils clients de PostgreSQL ne sont pas toujours
 * dans le PATH (installation Homebrew « keg-only », cron dépouillé) : plutôt
 * qu'un ENOENT sibyllin, on cherche puis on explique.
 */
function resolvePgDump(): string {
  if (process.env.PG_DUMP) return process.env.PG_DUMP;

  const candidates = [
    "/opt/homebrew/bin/pg_dump",
    "/opt/homebrew/opt/postgresql@17/bin/pg_dump",
    "/usr/local/bin/pg_dump",
    "/usr/bin/pg_dump",
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }

  try {
    execFileSync("pg_dump", ["--version"], { stdio: "ignore" });
    return "pg_dump";
  } catch {
    throw new Error(
      "pg_dump introuvable.\n" +
        `  • Base en conteneur ? Démarrez-la (npm run db:up) : le conteneur ${CONTAINER} sera utilisé.\n` +
        "  • Base locale ? Installez les outils clients (brew install postgresql@17)\n" +
        "    ou indiquez le binaire : PG_DUMP=/chemin/vers/pg_dump npm run backup",
    );
  }
}

function openWrite(file: string): number {
  return openSync(file, "w");
}

function archiveUploads(target: string): boolean {
  if (!existsSync(UPLOADS_DIR)) {
    console.log("  visuels: aucun dossier d'uploads, rien à archiver");
    return false;
  }
  execFileSync(
    "tar",
    ["-czf", target, "-C", path.dirname(UPLOADS_DIR), path.basename(UPLOADS_DIR)],
    { stdio: "inherit" },
  );
  return true;
}

/** Supprime les sauvegardes plus vieilles que la rétention. */
function prune(): number {
  const limit = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;

  for (const name of readdirSync(BACKUPS_DIR)) {
    if (!name.startsWith("scc-") && !name.startsWith("uploads-")) continue;
    const file = path.join(BACKUPS_DIR, name);
    if (statSync(file).mtimeMs < limit) {
      unlinkSync(file);
      removed += 1;
    }
  }
  return removed;
}

function sizeOf(file: string): string {
  const bytes = statSync(file).size;
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} Ko`
    : `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function main(): void {
  const db = parseDatabaseUrl();
  mkdirSync(BACKUPS_DIR, { recursive: true });

  const stamp = timestamp();
  const dumpFile = path.join(BACKUPS_DIR, `scc-${stamp}.dump`);
  const uploadsFile = path.join(BACKUPS_DIR, `uploads-${stamp}.tar.gz`);

  console.log("── Sauvegarde ────────────────────────────────");
  console.log(`  cible  : ${BACKUPS_DIR}`);

  dumpDatabase(db, dumpFile);
  const withUploads = archiveUploads(uploadsFile);

  const removed = prune();

  console.log("\n── Résultat ──────────────────────────────────");
  console.log(`  ${path.basename(dumpFile)} (${sizeOf(dumpFile)})`);
  if (withUploads) {
    console.log(`  ${path.basename(uploadsFile)} (${sizeOf(uploadsFile)})`);
  }
  console.log(`  rétention ${RETENTION_DAYS} j — ${removed} fichier(s) purgé(s)`);
  console.log(
    "\n⚠️  Une sauvegarde jamais restaurée n'est pas une sauvegarde :" +
      " testez `npm run restore` sur une base jetable.",
  );
  console.log("✅ Sauvegarde terminée");
}

try {
  main();
} catch (e) {
  console.error("\n❌ Échec de la sauvegarde");
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
