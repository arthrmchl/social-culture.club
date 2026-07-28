"use server";

import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { applyEditionCoverage, recomputeViewings } from "@/lib/tracking";
import { normalizeLanguage } from "@/lib/languages";
import { upsertPersonIds } from "@/lib/people";
import { splitList } from "@/lib/text";
import { revalidateWork } from "./revalidate";
import type { ActionResult } from "./status";

/** Le seul rôle porté aujourd'hui par une personne rattachée à une édition. */
const TRANSLATOR = "traducteur";

/**
 * Éditions et intégrales (L6, D8).
 *
 * Une édition décrit l'objet publié : elle relève du **catalogue partagé**,
 * donc des droits d'édition de la fiche (D30 — créateur ou administrateur).
 * En revanche, choisir l'édition qu'on lit et déclarer avoir lu une intégrale
 * sont des gestes de **suivi**, ouverts à chacun sur ses propres données.
 */

const editionSchema = z.object({
  workId: z.string().min(1),
  tomeId: z.string().optional(),
  title: z.string().max(300).optional(),
  language: z.string().max(40).optional(),
  translators: z.string().optional(), // séparés par des virgules
  isbn: z.string().max(20).optional(),
  pageCount: z.coerce.number().int().positive().max(50_000).optional(),
  publisher: z.string().max(200).optional(),
  format: z.string().max(50).optional(),
  coversTomeFrom: z.coerce.number().int().min(1).max(1000).optional(),
  coversTomeTo: z.coerce.number().int().min(1).max(1000).optional(),
  coverImageId: z.string().optional(),
});

export type EditionInput = z.input<typeof editionSchema>;

/**
 * Remplace en bloc les traducteurs d'une édition, comme les créateurs d'une
 * œuvre : la saisie libre est la vérité, pas l'accumulation des saisies
 * précédentes.
 */
async function setTranslators(
  tx: Prisma.TransactionClient,
  editionId: string,
  raw: string,
) {
  await tx.editionCreator.deleteMany({
    where: { editionId, role: TRANSLATOR },
  });
  for (const personId of await upsertPersonIds(tx, splitList(raw))) {
    await tx.editionCreator.create({
      data: { editionId, personId, role: TRANSLATOR },
    });
  }
}

/** Droits d'édition d'une fiche (D30) : son créateur, ou l'administrateur. */
async function canEditWork(
  workId: string,
  user: { id: string; role?: string | null },
) {
  const work = await db.work.findUnique({
    where: { id: workId },
    select: { id: true, createdById: true },
  });
  if (!work) return { ok: false as const, error: "Œuvre introuvable." };
  if (work.createdById !== user.id && !isAdmin(user)) {
    return {
      ok: false as const,
      error:
        "Seul le créateur de la fiche ou l'administrateur peut gérer ses éditions.",
    };
  }
  return { ok: true as const };
}

export async function createEdition(
  input: EditionInput,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = editionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Édition invalide." };
  }
  const d = parsed.data;

  const allowed = await canEditWork(d.workId, user);
  if (!allowed.ok) return { error: allowed.error };

  await db.$transaction(async (tx) => {
    // La première édition d'une œuvre devient celle par défaut : sans quoi
    // aucune ne le serait, et `pickDefaultEdition` retomberait sur l'ordre
    // de création — un hasard plutôt qu'un choix.
    const count = await tx.edition.count({ where: { workId: d.workId } });

    const created = await tx.edition.create({
      data: {
        workId: d.workId,
        tomeId: d.tomeId || null,
        title: d.title || null,
        language: normalizeLanguage(d.language),
        isbn: d.isbn || null,
        pageCount: d.pageCount ?? null,
        publisher: d.publisher || null,
        format: d.format || null,
        coversTomeFrom: d.coversTomeFrom ?? null,
        coversTomeTo: d.coversTomeTo ?? null,
        coverImageId: d.coverImageId || null,
        isDefault: count === 0,
      },
    });

    if (d.translators) await setTranslators(tx, created.id, d.translators);
  });

  revalidateWork(d.workId);
  return { ok: true };
}

const editSchema = editionSchema.omit({ workId: true }).partial();

export async function editEdition(
  editionId: string,
  input: z.input<typeof editSchema>,
): Promise<ActionResult> {
  const user = await requireUser();

  const edition = await db.edition.findUnique({
    where: { id: editionId },
    select: { id: true, workId: true, tome: { select: { workId: true } } },
  });
  if (!edition) return { error: "Édition introuvable." };

  const workId = edition.workId ?? edition.tome?.workId;
  if (!workId) return { error: "Édition orpheline." };

  const allowed = await canEditWork(workId, user);
  if (!allowed.ok) return { error: allowed.error };

  const parsed = editSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Édition invalide." };
  }
  const d = parsed.data;

  await db.$transaction(async (tx) => {
    await tx.edition.update({
      where: { id: editionId },
      data: {
        ...(d.title !== undefined ? { title: d.title || null } : {}),
        ...(d.language !== undefined
          ? { language: normalizeLanguage(d.language) }
          : {}),
        ...(d.isbn !== undefined ? { isbn: d.isbn || null } : {}),
        ...(d.pageCount !== undefined
          ? { pageCount: d.pageCount ?? null }
          : {}),
        ...(d.publisher !== undefined
          ? { publisher: d.publisher || null }
          : {}),
        ...(d.format !== undefined ? { format: d.format || null } : {}),
        ...(d.coversTomeFrom !== undefined
          ? { coversTomeFrom: d.coversTomeFrom ?? null }
          : {}),
        ...(d.coversTomeTo !== undefined
          ? { coversTomeTo: d.coversTomeTo ?? null }
          : {}),
        ...(d.coverImageId !== undefined
          ? { coverImageId: d.coverImageId || null }
          : {}),
      },
    });

    if (d.translators !== undefined) {
      await setTranslators(tx, editionId, d.translators);
    }
  });

  revalidateWork(workId);
  return { ok: true };
}

export async function deleteEdition(editionId: string): Promise<ActionResult> {
  const user = await requireUser();

  const edition = await db.edition.findUnique({
    where: { id: editionId },
    select: {
      id: true,
      workId: true,
      isDefault: true,
      tome: { select: { workId: true } },
    },
  });
  if (!edition) return { error: "Édition introuvable." };

  const workId = edition.workId ?? edition.tome?.workId;
  if (!workId) return { error: "Édition orpheline." };

  const allowed = await canEditWork(workId, user);
  if (!allowed.ok) return { error: allowed.error };

  await db.$transaction(async (tx) => {
    await tx.edition.delete({ where: { id: editionId } });

    // Supprimer l'édition par défaut ne doit pas laisser l'œuvre sans défaut.
    if (edition.isDefault) {
      const next = await tx.edition.findFirst({
        where: { workId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (next) {
        await tx.edition.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
  });

  revalidateWork(workId);
  return { ok: true };
}

/**
 * Désigne l'édition de référence d'une œuvre (D8).
 *
 * L'invariante « une seule édition par défaut » n'est pas exprimable en base
 * — un index unique partiel se ferait réécrire à chaque `migrate dev`. Elle
 * est donc tenue ici, dans une transaction.
 */
export async function setDefaultEdition(
  editionId: string,
): Promise<ActionResult> {
  const user = await requireUser();

  const edition = await db.edition.findUnique({
    where: { id: editionId },
    select: { id: true, workId: true, tome: { select: { workId: true } } },
  });
  if (!edition) return { error: "Édition introuvable." };

  const workId = edition.workId ?? edition.tome?.workId;
  if (!workId) return { error: "Édition orpheline." };

  const allowed = await canEditWork(workId, user);
  if (!allowed.ok) return { error: allowed.error };

  await db.$transaction(async (tx) => {
    await tx.edition.updateMany({
      where: { workId, isDefault: true },
      data: { isDefault: false },
    });
    await tx.edition.update({
      where: { id: editionId },
      data: { isDefault: true },
    });
  });

  revalidateWork(workId);
  return { ok: true };
}

/** L'édition que je lis (D8) — donnée de suivi, ouverte à chacun. */
export async function setMyEdition(
  workId: string,
  editionId: string | null,
): Promise<ActionResult> {
  const user = await requireUser();

  if (editionId) {
    const edition = await db.edition.findUnique({
      where: { id: editionId },
      select: { workId: true, tome: { select: { workId: true } } },
    });
    const owner = edition?.workId ?? edition?.tome?.workId ?? null;
    if (owner !== workId) return { error: "Édition introuvable." };
  }

  await db.userWork.upsert({
    where: { userId_workId: { userId: user.id, workId } },
    update: { editionId },
    create: { userId: user.id, workId, editionId },
  });

  revalidateWork(workId);
  return { ok: true };
}

/**
 * « J'ai lu cette intégrale » (L6, D8) : une entrée de journal, et les tomes
 * couverts marqués comme lus.
 */
export async function markOmnibusRead(
  editionId: string,
  loggedAt?: string | null,
): Promise<ActionResult> {
  const user = await requireUser();

  const edition = await db.edition.findUnique({
    where: { id: editionId },
    select: {
      id: true,
      workId: true,
      coversTomeFrom: true,
      coversTomeTo: true,
      tome: { select: { workId: true } },
    },
  });
  if (!edition) return { error: "Édition introuvable." };

  const workId = edition.workId ?? edition.tome?.workId;
  if (!workId) return { error: "Édition orpheline." };
  if (edition.coversTomeFrom == null && edition.coversTomeTo == null) {
    return { error: "Cette édition ne couvre aucune étendue de tomes." };
  }

  const when = loggedAt ? new Date(loggedAt) : new Date();
  if (Number.isNaN(when.getTime())) return { error: "Date invalide." };

  // Sentinelle : signaler « aucun tome » depuis la transaction, pour que
  // l'entrée de journal déjà écrite reparte avec elle plutôt que de rester
  // seule à consigner une lecture qui n'a rien marqué.
  const NO_TOMES = "SCC_NO_TOMES";

  try {
    await db.$transaction(
      async (tx) => {
        await tx.journalEntry.create({
          data: {
            userId: user.id,
            workId,
            editionId,
            loggedAt: when,
            datePrecision: "DAY",
          },
        });
        const covered = await applyEditionCoverage(
          tx,
          user.id,
          workId,
          editionId,
        );
        if (covered === 0) throw new Error(NO_TOMES);
        await recomputeViewings(tx, user.id, workId);
      },
      { timeout: 30_000 },
    );
  } catch (e) {
    if (e instanceof Error && e.message === NO_TOMES) {
      return {
        error:
          "Aucun tome correspondant n'existe encore sur cette fiche : créez-les d'abord.",
      };
    }
    throw e;
  }

  revalidateWork(workId);
  return { ok: true };
}
