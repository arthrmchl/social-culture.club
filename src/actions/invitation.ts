"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentSession, isAdmin } from "@/lib/session";

function generateCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if (i === 3) out += "-";
  }
  return `SCC-${out}`;
}

/** Génère une invitation (réservé à l'administrateur — D24). */
export async function createInvitation(
  email?: string,
): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const session = await getCurrentSession();
  if (!session || !isAdmin(session.user)) {
    return { ok: false, error: "Réservé à l'administrateur." };
  }

  const code = generateCode();
  await db.invitation.create({
    data: {
      code,
      email: email?.trim() || null,
      invitedById: session.user.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 jours
    },
  });

  revalidatePath("/invitations");
  return { ok: true, code };
}

/** Vérifie qu'une invitation est utilisable. */
export async function checkInvitation(rawCode: string): Promise<boolean> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return false;
  const invitation = await db.invitation.findUnique({ where: { code } });
  if (!invitation || invitation.usedById) return false;
  if (invitation.expiresAt && invitation.expiresAt < new Date()) return false;
  return true;
}
