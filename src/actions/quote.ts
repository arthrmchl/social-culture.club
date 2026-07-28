"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isReading } from "@/lib/media";
import { revalidateWork } from "./revalidate";
import type { ActionResult } from "./status";

/**
 * Citations (L3, D9 : lectures uniquement).
 *
 * Le modèle ne restreint pas le type d'œuvre — l'ouvrir à d'autres médias ne
 * demandera pas de migration. La règle vit ici, en un seul endroit.
 */

const quoteSchema = z.object({
  workId: z.string().min(1),
  text: z.string().min(1, "Le passage ne peut pas être vide.").max(10000),
  page: z.number().int().positive().nullable().optional(),
  note: z.string().max(2000).optional(),
  tomeId: z.string().optional(),
  editionId: z.string().optional(),
});

export type QuoteInput = z.input<typeof quoteSchema>;

const NOT_A_READING =
  "Les citations ne concernent que les lectures : livres, BD et mangas.";

export async function createQuote(input: QuoteInput): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Citation invalide." };
  }
  const d = parsed.data;

  const work = await db.work.findUnique({
    where: { id: d.workId },
    select: { type: true },
  });
  if (!work) return { error: "Œuvre introuvable." };
  if (!isReading(work.type)) return { error: NOT_A_READING };

  await db.quote.create({
    data: {
      userId: user.id,
      workId: d.workId,
      tomeId: d.tomeId || null,
      editionId: d.editionId || null,
      text: d.text.trim(),
      page: d.page ?? null,
      note: d.note?.trim() || null,
    },
  });

  revalidateWork(d.workId);
  revalidatePath("/citations");
  return { ok: true };
}

const editSchema = quoteSchema.omit({ workId: true }).partial();

export async function editQuote(
  quoteId: string,
  input: z.input<typeof editSchema>,
): Promise<ActionResult> {
  const user = await requireUser();

  const quote = await db.quote.findFirst({
    where: { id: quoteId, userId: user.id },
    select: { id: true, workId: true },
  });
  if (!quote) return { error: "Citation introuvable." };

  const parsed = editSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Citation invalide." };
  }
  const d = parsed.data;

  await db.quote.update({
    where: { id: quoteId },
    data: {
      ...(d.text !== undefined ? { text: d.text.trim() } : {}),
      ...(d.page !== undefined ? { page: d.page ?? null } : {}),
      ...(d.note !== undefined ? { note: d.note.trim() || null } : {}),
      ...(d.tomeId !== undefined ? { tomeId: d.tomeId || null } : {}),
      ...(d.editionId !== undefined ? { editionId: d.editionId || null } : {}),
    },
  });

  revalidateWork(quote.workId);
  revalidatePath("/citations");
  return { ok: true };
}

export async function deleteQuote(quoteId: string): Promise<ActionResult> {
  const user = await requireUser();

  const quote = await db.quote.findFirst({
    where: { id: quoteId, userId: user.id },
    select: { id: true, workId: true },
  });
  if (!quote) return { error: "Citation introuvable." };

  await db.quote.delete({ where: { id: quoteId } });

  revalidateWork(quote.workId);
  revalidatePath("/citations");
  return { ok: true };
}
