"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { slugify } from "@/lib/text";
import { compactPositions, nextPosition, reorderPositions } from "@/lib/lists";
import { revalidateLists, revalidateWork } from "./revalidate";
import type { ActionResult } from "./status";

const listSchema = z.object({
  title: z.string().min(1, "Titre requis.").max(200),
  description: z.string().max(5000).optional(),
  isRanked: z.coerce.boolean().optional(),
  coverImageId: z.string().optional(),
});

export type ListFormState = { error: string } | undefined;

/** FormData -> objet, en ignorant les champs vides (cf. `work.ts`). */
function formToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string" && v !== "") out[k] = v;
  }
  return out;
}

/**
 * Slug libre pour un utilisateur donné : `ma-liste`, puis `ma-liste-2`…
 *
 * Deux listes peuvent légitimement porter le même titre ; c'est l'URL qui doit
 * les départager, pas un refus de création.
 */
async function uniqueSlug(
  userId: string,
  title: string,
  exceptId?: string,
): Promise<string> {
  const base = slugify(title) || "liste";
  const taken = await db.list.findMany({
    where: { userId, slug: { startsWith: base } },
    select: { id: true, slug: true },
  });
  const used = new Set(
    taken.filter((l) => l.id !== exceptId).map((l) => l.slug),
  );

  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** Charge une liste en vérifiant qu'elle m'appartient (données individuelles). */
async function ownedList(userId: string, listId: string) {
  return db.list.findFirst({
    where: { id: listId, userId },
    select: { id: true, slug: true },
  });
}

export async function createList(
  _prev: ListFormState,
  formData: FormData,
): Promise<ListFormState | never> {
  const user = await requireUser();

  const parsed = listSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Champs invalides." };
  }
  const d = parsed.data;

  const list = await db.list.create({
    data: {
      userId: user.id,
      title: d.title,
      slug: await uniqueSlug(user.id, d.title),
      description: d.description || null,
      isRanked: d.isRanked ?? false,
      coverImageId: d.coverImageId || null,
    },
    select: { slug: true },
  });

  revalidateLists();
  redirect(`/listes/${list.slug}`);
}

export async function editList(
  listId: string,
  _prev: ListFormState,
  formData: FormData,
): Promise<ListFormState | never> {
  const user = await requireUser();
  const existing = await db.list.findFirst({
    where: { id: listId, userId: user.id },
    select: { id: true, slug: true, title: true, coverImageId: true },
  });
  if (!existing) return { error: "Liste introuvable." };

  const parsed = listSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Champs invalides." };
  }
  const d = parsed.data;

  // Le slug ne bouge qu'avec le titre : un lien partagé ne se casse pas pour
  // une correction de description.
  const slug =
    d.title === existing.title
      ? existing.slug
      : await uniqueSlug(user.id, d.title, existing.id);

  await db.list.update({
    where: { id: listId },
    data: {
      title: d.title,
      slug,
      description: d.description || null,
      isRanked: d.isRanked ?? false,
      coverImageId: d.coverImageId || existing.coverImageId,
    },
  });

  revalidateLists(existing.slug);
  redirect(`/listes/${slug}`);
}

export async function deleteList(
  listId: string,
): Promise<{ error: string } | never> {
  const user = await requireUser();
  const list = await ownedList(user.id, listId);
  if (!list) return { error: "Liste introuvable." };

  // Les éléments partent en cascade (onDelete: Cascade), comme partout.
  await db.list.delete({ where: { id: listId } });

  revalidateLists(list.slug);
  redirect("/listes");
}

/** Épinglage d'une liste favorite (S9) — visible sur l'accueil. */
export async function togglePinList(listId: string): Promise<ActionResult> {
  const user = await requireUser();
  const list = await db.list.findFirst({
    where: { id: listId, userId: user.id },
    select: { id: true, slug: true, isPinned: true },
  });
  if (!list) return { error: "Liste introuvable." };

  await db.list.update({
    where: { id: listId },
    data: { isPinned: !list.isPinned },
  });

  revalidateLists(list.slug);
  return { ok: true };
}

export async function addToList(
  listId: string,
  workId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const list = await ownedList(user.id, listId);
  if (!list) return { error: "Liste introuvable." };

  const work = await db.work.findUnique({
    where: { id: workId },
    select: { id: true },
  });
  if (!work) return { error: "Œuvre introuvable." };

  await db.$transaction(async (tx) => {
    const items = await tx.listItem.findMany({
      where: { listId },
      select: { position: true },
    });
    await tx.listItem.createMany({
      data: [{ listId, workId, position: nextPosition(items) }],
      // Une œuvre déjà présente ne remonte pas en fin de liste.
      skipDuplicates: true,
    });
  });

  revalidateLists(list.slug);
  revalidateWork(workId);
  return { ok: true };
}

export async function removeFromList(
  listId: string,
  workId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const list = await ownedList(user.id, listId);
  if (!list) return { error: "Liste introuvable." };

  await db.$transaction(async (tx) => {
    await tx.listItem.deleteMany({ where: { listId, workId } });

    // Renumérotation : une liste ordonnée ne doit pas garder de trou.
    const rest = await tx.listItem.findMany({
      where: { listId },
      select: { id: true, position: true },
    });
    for (const { id, position } of compactPositions(rest)) {
      await tx.listItem.update({ where: { id }, data: { position } });
    }
  });

  revalidateLists(list.slug);
  revalidateWork(workId);
  return { ok: true };
}

const noteSchema = z.string().max(2000);

/** Commentaire par élément (S9). */
export async function setListItemNote(
  listId: string,
  workId: string,
  note: string,
): Promise<ActionResult> {
  const user = await requireUser();
  const list = await ownedList(user.id, listId);
  if (!list) return { error: "Liste introuvable." };

  const parsed = noteSchema.safeParse(note);
  if (!parsed.success) return { error: "Commentaire trop long." };

  const { count } = await db.listItem.updateMany({
    where: { listId, workId },
    data: { note: parsed.data.trim() || null },
  });
  if (count === 0) return { error: "Élément introuvable." };

  revalidateLists(list.slug);
  return { ok: true };
}

/**
 * Déplace un élément dans une liste ordonnée. Seules les lignes dont la
 * position change sont réécrites (`reorderPositions`).
 */
export async function moveListItem(
  listId: string,
  workId: string,
  toIndex: number,
): Promise<ActionResult> {
  const user = await requireUser();
  const list = await ownedList(user.id, listId);
  if (!list) return { error: "Liste introuvable." };

  await db.$transaction(async (tx) => {
    const items = await tx.listItem.findMany({
      where: { listId },
      select: { id: true, position: true, workId: true },
    });
    const moved = items.find((i) => i.workId === workId);
    if (!moved) return;

    for (const { id, position } of reorderPositions(items, moved.id, toIndex)) {
      await tx.listItem.update({ where: { id }, data: { position } });
    }
  });

  revalidateLists(list.slug);
  return { ok: true };
}

/** Mes listes, avec l'appartenance d'une œuvre — alimente « Ajouter à une liste ». */
export async function myListsFor(
  workId: string,
): Promise<{ id: string; title: string; contains: boolean }[]> {
  const user = await requireUser();

  const lists = await db.list.findMany({
    where: { userId: user.id },
    orderBy: [{ isPinned: "desc" }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      items: { where: { workId }, select: { workId: true } },
    },
  });

  return lists.map((l) => ({
    id: l.id,
    title: l.title,
    contains: l.items.length > 0,
  }));
}
