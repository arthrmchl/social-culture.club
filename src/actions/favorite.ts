"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { FAVORITES_FULL, MAX_FAVORITES } from "@/lib/favorites";
import { revalidateWork } from "./revalidate";
import type { ActionResult } from "./status";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Favoris de profil (S11) — quatre œuvres en tête de profil, tous médias
 * confondus, exactement le geste Letterboxd.
 *
 * Le plafond et la compacité des positions sont tenus ici : la base ne peut
 * pas les exprimer sans rendre toute permutation impossible.
 */

/** Ajoute ou retire une œuvre des favoris (S11). */
export async function toggleFavorite(workId: string): Promise<ActionResult> {
  const user = await requireUser();

  const work = await db.work.findUnique({
    where: { id: workId },
    select: { id: true },
  });
  if (!work) return { error: "Œuvre introuvable." };

  const existing = await db.favorite.findUnique({
    where: { userId_workId: { userId: user.id, workId } },
    select: { id: true },
  });

  if (existing) {
    await db.$transaction(async (tx) => {
      await tx.favorite.delete({ where: { id: existing.id } });
      await compact(tx, user.id);
    });
  } else {
    const count = await db.favorite.count({ where: { userId: user.id } });
    if (count >= MAX_FAVORITES) return { error: FAVORITES_FULL };

    await db.favorite.create({
      data: { userId: user.id, workId, position: count },
    });
  }

  revalidateWork(workId);
  revalidatePath("/profil");
  return { ok: true };
}

/**
 * Redéfinit l'ordre complet des favoris (S11). Les œuvres inconnues ou
 * dupliquées sont écartées, et le plafond est vérifié avant toute écriture.
 */
export async function setFavorites(workIds: string[]): Promise<ActionResult> {
  const user = await requireUser();

  const unique = [...new Set(workIds)];
  if (unique.length > MAX_FAVORITES) return { error: FAVORITES_FULL };

  const found = await db.work.findMany({
    where: { id: { in: unique } },
    select: { id: true },
  });
  if (found.length !== unique.length) return { error: "Œuvre introuvable." };

  await db.$transaction(async (tx) => {
    await tx.favorite.deleteMany({ where: { userId: user.id } });
    if (unique.length > 0) {
      await tx.favorite.createMany({
        data: unique.map((workId, position) => ({
          userId: user.id,
          workId,
          position,
        })),
      });
    }
  });

  for (const workId of unique) revalidateWork(workId);
  revalidatePath("/profil");
  return { ok: true };
}

/** Renumérote les favoris restants de 0 à n-1, sans trou. */
async function compact(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const rest = await tx.favorite.findMany({
    where: { userId },
    orderBy: { position: "asc" },
    select: { id: true, position: true },
  });
  for (const [index, fav] of rest.entries()) {
    if (fav.position !== index) {
      await tx.favorite.update({
        where: { id: fav.id },
        data: { position: index },
      });
    }
  }
}
