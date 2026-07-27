import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const E2E_CODE = "SCC-E2E-0001";

/** Provisionne une invitation neuve et réutilisable avant chaque run E2E. */
export default async function globalSetup() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const admin = await pool.query(
    `SELECT id FROM "user" WHERE role = 'admin' LIMIT 1`,
  );
  if (!admin.rows[0]) throw new Error("Admin introuvable — lancer le seed.");
  const adminId = admin.rows[0].id as string;

  await pool.query(`DELETE FROM "Invitation" WHERE code = $1`, [E2E_CODE]);
  await pool.query(
    `INSERT INTO "Invitation" (id, code, "invitedById", "expiresAt", "createdAt")
     VALUES ($1, $2, $3, $4, now())`,
    [randomUUID(), E2E_CODE, adminId, new Date(Date.now() + 1000 * 60 * 60 * 24)],
  );
  await pool.end();
}
