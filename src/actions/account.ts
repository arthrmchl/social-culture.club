"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import type { ActionResult } from "@/actions/status";

/** Compte technique qui hérite des fiches d'un membre parti (D29). */
const SYSTEM_EMAIL = "compte-supprime@social-culture.club";
const SYSTEM_NAME = "Compte supprimé";

const confirmSchema = z.object({
  confirmation: z.string().min(1, "Saisissez votre nom d'utilisateur."),
});

/**
 * Suppression effective du compte (N9).
 *
 * Le catalogue est partagé (D29) : les fiches créées par le membre profitent à
 * tous et ne doivent pas disparaître avec lui. Or `Work.createdBy` est une
 * relation obligatoire — sans réattribution préalable, PostgreSQL refuserait
 * purement et simplement la suppression. On transfère donc les fiches à un
 * compte technique, puis on supprime : tout le reste (suivi, journal, listes
 * d'import) part en cascade.
 */
export async function deleteMyAccount(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult | never> {
  const user = await requireUser();

  const parsed = confirmSchema.safeParse({
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Confirmation requise." };
  }

  const expected = user.username ?? user.email;
  if (parsed.data.confirmation.trim() !== expected) {
    return {
      error: `Pour confirmer, saisissez exactement « ${expected} ».`,
    };
  }

  // Un administrateur seul ne peut pas se supprimer : l'instance deviendrait
  // ingouvernable (modération, invitations, reprise de fiches — P4, R8).
  if (user.role === "admin") {
    const admins = await db.user.count({ where: { role: "admin" } });
    if (admins <= 1) {
      return {
        error:
          "Vous êtes le seul administrateur : nommez-en un autre avant de supprimer ce compte.",
      };
    }
  }

  await db.$transaction(async (tx) => {
    const owned = await tx.work.count({ where: { createdById: user.id } });

    if (owned > 0) {
      const system = await tx.user.upsert({
        where: { email: SYSTEM_EMAIL },
        update: {},
        create: {
          id: `system-deleted-${Date.now()}`,
          name: SYSTEM_NAME,
          email: SYSTEM_EMAIL,
          emailVerified: false,
          role: "user",
          banned: true, // compte technique : personne ne s'y connecte
        },
        select: { id: true },
      });

      await tx.work.updateMany({
        where: { createdById: user.id },
        data: { createdById: system.id },
      });
    }

    await tx.user.delete({ where: { id: user.id } });
  });

  await auth.api.signOut({ headers: await headers() });
  redirect("/connexion");
}
