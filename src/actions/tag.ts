"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { parseTagInput, type ParsedTag } from "@/lib/tags";
import { slugify } from "@/lib/text";
import { revalidateWork } from "./revalidate";
import type { ActionResult } from "./status";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Étiquettes personnelles (S10).
 *
 * Un tag appartient à son auteur : le catalogue est partagé (D29), le
 * vocabulaire qu'on lui applique ne l'est pas. Toute lecture comme toute
 * écriture se referme donc sur `userId`.
 */

/** Upsert des tags saisis, dans la transaction appelante. Rend leurs ids. */
async function ensureTags(
  tx: Prisma.TransactionClient,
  userId: string,
  tags: ParsedTag[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const { name, slug } of tags) {
    const tag = await tx.tag.upsert({
      where: { userId_slug: { userId, slug } },
      // Le libellé d'origine est conservé : renommer passe par renameTag.
      update: {},
      create: { userId, name, slug },
      select: { id: true },
    });
    ids.push(tag.id);
  }
  return ids;
}

/** Pose l'ensemble exact des étiquettes d'une œuvre (S10). */
export async function setWorkTags(
  workId: string,
  raw: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const work = await db.work.findUnique({
    where: { id: workId },
    select: { id: true },
  });
  if (!work) return { error: "Œuvre introuvable." };

  const tags = parseTagInput(raw);

  await db.$transaction(async (tx) => {
    const ids = await ensureTags(tx, user.id, tags);

    // Retirer d'abord ce qui n'est plus là, en restant dans mes tags : une
    // étiquette posée par quelqu'un d'autre ne me regarde pas.
    await tx.workTag.deleteMany({
      where: { workId, tag: { userId: user.id }, tagId: { notIn: ids } },
    });
    if (ids.length > 0) {
      await tx.workTag.createMany({
        data: ids.map((tagId) => ({ workId, tagId })),
        skipDuplicates: true,
      });
    }
  });

  revalidateWork(workId);
  revalidatePath("/tags");
  return { ok: true };
}

/** Pose l'ensemble exact des étiquettes d'une entrée de journal (S10). */
export async function setEntryTags(
  entryId: string,
  raw: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const entry = await db.journalEntry.findFirst({
    where: { id: entryId, userId: user.id },
    select: { id: true, workId: true },
  });
  if (!entry) return { error: "Entrée introuvable." };

  const tags = parseTagInput(raw);

  await db.$transaction(async (tx) => {
    const ids = await ensureTags(tx, user.id, tags);

    await tx.journalEntryTag.deleteMany({
      where: { entryId, tagId: { notIn: ids } },
    });
    if (ids.length > 0) {
      await tx.journalEntryTag.createMany({
        data: ids.map((tagId) => ({ entryId, tagId })),
        skipDuplicates: true,
      });
    }
  });

  revalidateWork(entry.workId);
  revalidatePath("/tags");
  return { ok: true };
}

const nameSchema = z.string().min(1, "Nom requis.").max(50);

export async function renameTag(
  tagId: string,
  name: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = nameSchema.safeParse(name.trim());
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Nom invalide." };
  }

  const tag = await db.tag.findFirst({
    where: { id: tagId, userId: user.id },
    select: { id: true, slug: true },
  });
  if (!tag) return { error: "Étiquette introuvable." };

  const slug = slugify(parsed.data);
  if (!slug) return { error: "Ce nom ne donne aucune étiquette lisible." };

  // Renommer vers une étiquette déjà existante fusionnerait deux vocabulaires :
  // on préfère le dire plutôt que de perdre silencieusement des liaisons.
  if (slug !== tag.slug) {
    const clash = await db.tag.findUnique({
      where: { userId_slug: { userId: user.id, slug } },
      select: { id: true },
    });
    if (clash) return { error: "Vous avez déjà une étiquette de ce nom." };
  }

  await db.tag.update({
    where: { id: tagId },
    data: { name: parsed.data, slug },
  });

  revalidatePath("/tags");
  revalidatePath(`/tag/${tag.slug}`);
  revalidatePath(`/tag/${slug}`);
  return { ok: true };
}

export async function deleteTag(tagId: string): Promise<ActionResult> {
  const user = await requireUser();

  const tag = await db.tag.findFirst({
    where: { id: tagId, userId: user.id },
    select: { id: true, slug: true },
  });
  if (!tag) return { error: "Étiquette introuvable." };

  // Les liaisons partent en cascade : supprimer une étiquette ne touche ni les
  // œuvres ni les entrées, seulement le classement qu'on leur avait donné.
  await db.tag.delete({ where: { id: tagId } });

  revalidatePath("/tags");
  revalidatePath(`/tag/${tag.slug}`);
  return { ok: true };
}

/** Mes étiquettes existantes, pour l'autocomplétion du champ de saisie. */
export async function suggestTags(
  query: string,
): Promise<{ name: string; slug: string }[]> {
  const user = await requireUser();
  const q = query.trim();

  return db.tag.findMany({
    where: {
      userId: user.id,
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { name: "asc" },
    take: 10,
    select: { name: true, slug: true },
  });
}
