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

async function main() {
  // ─── Administrateur ───────────────────────────────────────
  let admin = await db.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!admin) {
    const id = randomUUID();
    admin = await db.user.create({
      data: {
        id,
        name: "Administrateur",
        email: ADMIN_EMAIL,
        emailVerified: true,
        username: ADMIN_USERNAME,
        displayUsername: ADMIN_USERNAME,
        role: "admin",
      },
    });
    await db.account.create({
      data: {
        id: randomUUID(),
        accountId: id,
        providerId: "credential",
        userId: id,
        password: await hashPassword(ADMIN_PASSWORD),
      },
    });
    console.log(`✅ Admin créé : ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  } else {
    console.log(`ℹ️  Admin déjà présent : ${ADMIN_EMAIL}`);
  }

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
