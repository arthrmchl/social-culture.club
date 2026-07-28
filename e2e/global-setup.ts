import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const E2E_CODE = "SCC-E2E-0001";

/**
 * Provisionne une invitation neuve et remet l'état social à zéro avant chaque
 * run E2E.
 *
 * La purge sociale (lot 4) est indispensable à la rejouabilité : à la seconde
 * exécution, l'abonnement, le blocage et les notifications du run précédent
 * subsistent, et l'étape « Suivre » ne trouve plus son bouton. Elle ne touche
 * que les deux comptes du seed, et jamais les œuvres — celles-ci portent
 * l'historique de vérification des lots précédents.
 */
export default async function globalSetup() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const admin = await pool.query(
    `SELECT id FROM "user" WHERE role = 'admin' LIMIT 1`,
  );
  if (!admin.rows[0]) throw new Error("Admin introuvable — lancer le seed.");
  const adminId = admin.rows[0].id as string;

  const seeded = await pool.query(
    `SELECT id FROM "user" WHERE username IN ('admin', 'membre')`,
  );
  const ids = seeded.rows.map((r) => r.id as string);
  if (ids.length < 2) {
    throw new Error(
      "Second membre introuvable — relancer `npm run db:seed` (lot 4).",
    );
  }

  await pool.query(`DELETE FROM "Invitation" WHERE code = $1`, [E2E_CODE]);
  await pool.query(
    `INSERT INTO "Invitation" (id, code, "invitedById", "expiresAt", "createdAt")
     VALUES ($1, $2, $3, $4, now())`,
    [randomUUID(), E2E_CODE, adminId, new Date(Date.now() + 1000 * 60 * 60 * 24)],
  );

  // ── État social des deux comptes seedés ─────────────────────
  await pool.query(
    `DELETE FROM "Follow" WHERE "followerId" = ANY($1) OR "followingId" = ANY($1)`,
    [ids],
  );
  await pool.query(
    `DELETE FROM "Block" WHERE "blockerId" = ANY($1) OR "blockedId" = ANY($1)`,
    [ids],
  );
  await pool.query(
    `DELETE FROM "Notification" WHERE "userId" = ANY($1) OR "actorId" = ANY($1)`,
    [ids],
  );
  await pool.query(`DELETE FROM "Report" WHERE "reporterId" = ANY($1)`, [ids]);
  await pool.query(`DELETE FROM "Comment" WHERE "authorId" = ANY($1)`, [ids]);
  await pool.query(`DELETE FROM "SocialLike" WHERE "userId" = ANY($1)`, [ids]);
  await pool.query(
    `DELETE FROM "CorrectionSuggestion" WHERE "authorId" = ANY($1)`,
    [ids],
  );

  // Le compte doit repartir ouvert : une étape du scénario le passe en privé.
  await pool.query(
    `UPDATE "user" SET visibility = 'PUBLIC', "showJournalPublicly" = true,
                       "showStatsPublicly" = true
     WHERE id = ANY($1)`,
    [ids],
  );
  // Et rien ne doit rester masqué d'un run précédent.
  await pool.query(
    `UPDATE "JournalEntry" SET "hiddenAt" = NULL WHERE "userId" = ANY($1)`,
    [ids],
  );
  await pool.query(
    `UPDATE "List" SET "hiddenAt" = NULL, "isPrivate" = false
     WHERE "userId" = ANY($1)`,
    [ids],
  );
  await pool.query(
    `UPDATE "UserWork" SET "hiddenAt" = NULL WHERE "userId" = ANY($1)`,
    [ids],
  );

  await pool.end();
}
