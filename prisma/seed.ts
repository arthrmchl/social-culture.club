import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { slugify } from "../src/lib/text";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@social-culture.club";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";
const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME ?? "admin";

// Second membre (lot 4) : sans lui, rien de social n'est testable — ni le fil,
// ni un abonnement, ni un blocage, ni une file de modération. Aucun lien n'est
// créé entre les deux comptes : le scénario e2e doit pouvoir cliquer
// « Suivre » sur un état vierge.
const MEMBER_EMAIL = process.env.SEED_MEMBER_EMAIL ?? "membre@social-culture.club";
const MEMBER_PASSWORD = process.env.SEED_MEMBER_PASSWORD ?? "changeme123";
const MEMBER_USERNAME = process.env.SEED_MEMBER_USERNAME ?? "membre";

const GENRES = [
  "Action",
  "Aventure",
  "Comédie",
  "Drame",
  "Fantastique",
  "Science-fiction",
  "Horreur",
  "Thriller",
  "Romance",
  "Policier",
  "Documentaire",
  "Animation",
  "Historique",
  "Biographie",
  "Jeunesse",
  "Fantasy",
  "Slice of life",
  "Shōnen",
  "Seinen",
];

/** Crée un compte et ses identifiants s'il n'existe pas déjà (idempotent). */
async function ensureUser(opts: {
  email: string;
  password: string;
  username: string;
  name: string;
  role: "admin" | "user";
}) {
  const existing = await db.user.findUnique({ where: { email: opts.email } });
  if (existing) {
    console.log(`ℹ️  Compte déjà présent : ${opts.email}`);
    return existing;
  }

  const id = randomUUID();
  const user = await db.user.create({
    data: {
      id,
      name: opts.name,
      email: opts.email,
      emailVerified: true,
      username: opts.username,
      displayUsername: opts.username,
      role: opts.role,
    },
  });
  await db.account.create({
    data: {
      id: randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await hashPassword(opts.password),
    },
  });
  console.log(`✅ Compte créé : ${opts.email} / ${opts.password}`);
  return user;
}

async function main() {
  // ─── Comptes ──────────────────────────────────────────────
  const admin = await ensureUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    username: ADMIN_USERNAME,
    name: "Administrateur",
    role: "admin",
  });

  await ensureUser({
    email: MEMBER_EMAIL,
    password: MEMBER_PASSWORD,
    username: MEMBER_USERNAME,
    name: "Membre",
    role: "user",
  });

  // ─── Invitation de démarrage ──────────────────────────────
  const existing = await db.invitation.findFirst({
    where: { usedById: null },
  });
  if (!existing) {
    const invitation = await db.invitation.create({
      data: {
        code: "SCC-WELCOME-01",
        invitedById: admin.id,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90),
      },
    });
    console.log(`✅ Invitation de démarrage : ${invitation.code}`);
  }

  // ─── Genres ───────────────────────────────────────────────
  for (const name of GENRES) {
    await db.genre.upsert({
      where: { name },
      update: {},
      create: { name, slug: slugify(name) },
    });
  }
  console.log(`✅ ${GENRES.length} genres prêts`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
