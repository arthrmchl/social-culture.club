"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { GOAL_SCOPES, MAX_GOAL_TARGET } from "@/lib/goals";
import type { ActionResult } from "./status";
import type { GoalScope } from "@/generated/prisma/enums";

/** Objectifs annuels (L5, D12) — une cible par portée et par année. */

const goalSchema = z.object({
  year: z.coerce.number().int().min(1900).max(2200),
  scope: z.enum(GOAL_SCOPES as [GoalScope, ...GoalScope[]]),
  target: z.coerce.number().int().min(0).max(MAX_GOAL_TARGET),
});

export type GoalInput = z.input<typeof goalSchema>;

/**
 * Pose ou met à jour un objectif. Une cible à zéro le supprime : c'est le
 * geste naturel pour renoncer, et cela évite un second bouton.
 */
export async function setGoal(input: GoalInput): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = goalSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Objectif invalide." };
  }
  const { year, scope, target } = parsed.data;

  if (target === 0) {
    await db.goal.deleteMany({ where: { userId: user.id, year, scope } });
  } else {
    await db.goal.upsert({
      where: { userId_year_scope: { userId: user.id, year, scope } },
      update: { target },
      create: { userId: user.id, year, scope, target },
    });
  }

  revalidatePath("/objectifs");
  revalidatePath("/");
  return { ok: true };
}
