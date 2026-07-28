"use server";

import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import {
  markEditionTomesRead,
  recomputeTomesState,
  recomputeViewings,
} from "@/lib/tracking";
import { buildTomes } from "@/lib/generators";
import { usesTomes } from "@/lib/media";
import { normalizeLanguage } from "@/lib/languages";
import { upsertPersonIds } from "@/lib/people";
import { splitList } from "@/lib/text";
import { revalidateWork } from "./revalidate";
import type { ActionResult } from "./status";

/** Le seul rôle porté aujourd'hui par une personne rattachée à une édition. */
const TRANSLATOR = "traducteur";

/**
 * Éditions (L6, D8).
 *
 * Une édition décrit l'objet publié : elle relève du **catalogue partagé**,
 * donc des droits d'édition de la fiche (D30 — créateur ou administrateur).
 * En revanche, choisir l'édition qu'on lit et déclarer l'avoir lue sont des
 * gestes de **suivi**, ouverts à chacun sur ses propres données.
 *
 * Depuis le lot 6, l'édition porte ses **tomes** : le nombre de volumes décrit
 * un tirage, pas un texte.
 */

const editionSchema = z.object({
  workId: z.string().min(1),
  title: z.string().max(300).optional(),
  language: z.string().max(40).optional(),
  translators: z.string().optional(), // séparés par des virgules
  isbn: z.string().max(20).optional(),
  pageCount: z.coerce.number().int().positive().max(50_000).optional(),
  publisher: z.string().max(200).optional(),
  format: z.string().max(50).optional(),
  tomeCount: z.coerce.number().int().min(0).max(500).optional(),
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
    select: { id: true, type: true, createdById: true },
  });
  if (!work) return { ok: false as const, error: "Œuvre introuvable." };
  if (work.createdById !== user.id && !isAdmin(user)) {
    return {
      ok: false as const,
      error:
        "Seul le créateur de la fiche ou l'administrateur peut gérer ses éditions.",
    };
  }
  return { ok: true as const, type: work.type };
}

/**
 * Sentinelle : un tome déjà suivi ne peut pas disparaître d'un tirage. Elle
 * traverse la transaction avec le numéro fautif, pour que le refus soit
 * nommé — et que l'écriture qui l'accompagne soit défaite.
 */
const TOME_TRACKED = "SCC_TOME_TRACKED";

/**
 * Ajuste les volumes d'un tirage au nombre déclaré.
 *
 * À la hausse, les tomes manquants sont créés. À la baisse, le surplus n'est
 * retiré que s'il n'est suivi par **personne** : l'édition appartient au
 * catalogue partagé (D30), la réduire ne peut pas effacer la lecture d'autrui.
 */
async function setTomeCount(
  tx: Prisma.TransactionClient,
  editionId: string,
  count: number,
): Promise<void> {
  const existing = await tx.tome.findMany({
    where: { editionId },
    select: { id: true, number: true },
  });

  const surplus = existing.filter((t) => t.number > count);
  if (surplus.length > 0) {
    const tracked = await tx.tomeProgress.findFirst({
      where: { tomeId: { in: surplus.map((t) => t.id) } },
      select: { tome: { select: { number: true } } },
      orderBy: { tome: { number: "asc" } },
    });
    if (tracked) throw new Error(`${TOME_TRACKED}:${tracked.tome.number}`);
    await tx.tome.deleteMany({
      where: { id: { in: surplus.map((t) => t.id) } },
    });
  }

  const present = new Set(existing.map((t) => t.number));
  const missing = buildTomes(count).filter((t) => !present.has(t.number));
  if (missing.length > 0) {
    await tx.tome.createMany({
      data: missing.map((t) => ({
        editionId,
        number: t.number,
        title: t.title,
      })),
    });
  }
}

/**
 * Générer 500 volumes dépasse largement les 5 s par défaut : le lot 2 avait
 * déjà dû desserrer ce verrou pour ses paquets.
 */
const TOME_TIMEOUT = { timeout: 30_000 };

/** Traduit la sentinelle en refus lisible ; relance tout le reste. */
function tomeRefusal(e: unknown): { error: string } | null {
  if (e instanceof Error && e.message.startsWith(`${TOME_TRACKED}:`)) {
    const number = e.message.split(":")[1];
    return {
      error: `Le tome ${number} est déjà suivi par un membre : il ne peut pas être retiré.`,
    };
  }
  return null;
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

  try {
    await db.$transaction(async (tx) => {
      // La première édition d'une œuvre devient celle par défaut : sans quoi
      // aucune ne le serait, et `pickDefaultEdition` retomberait sur l'ordre
      // de création — un hasard plutôt qu'un choix.
      const count = await tx.edition.count({ where: { workId: d.workId } });

      const created = await tx.edition.create({
        data: {
          workId: d.workId,
          title: d.title || null,
          language: normalizeLanguage(d.language),
          isbn: d.isbn || null,
          pageCount: d.pageCount ?? null,
          publisher: d.publisher || null,
          format: d.format || null,
          coverImageId: d.coverImageId || null,
          isDefault: count === 0,
        },
      });

      if (d.translators) await setTranslators(tx, created.id, d.translators);
      // Les tomes ne valent que pour un média suivi au tome : un livre n'a pas
      // de volumes, quoi qu'en dise un formulaire trafiqué.
      if (usesTomes(allowed.type) && d.tomeCount) {
        await setTomeCount(tx, created.id, d.tomeCount);
      }
    }, TOME_TIMEOUT);
  } catch (e) {
    const refus = tomeRefusal(e);
    if (refus) return refus;
    throw e;
  }

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
    select: { id: true, workId: true },
  });
  if (!edition) return { error: "Édition introuvable." };

  const workId = edition.workId;
  const allowed = await canEditWork(workId, user);
  if (!allowed.ok) return { error: allowed.error };

  const parsed = editSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Édition invalide." };
  }
  const d = parsed.data;

  try {
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
          ...(d.coverImageId !== undefined
            ? { coverImageId: d.coverImageId || null }
            : {}),
        },
      });

      if (d.translators !== undefined) {
        await setTranslators(tx, editionId, d.translators);
      }
      if (usesTomes(allowed.type) && d.tomeCount !== undefined) {
        await setTomeCount(tx, editionId, d.tomeCount);
      }
    }, TOME_TIMEOUT);
  } catch (e) {
    const refus = tomeRefusal(e);
    if (refus) return refus;
    throw e;
  }

  revalidateWork(workId);
  return { ok: true };
}

export async function deleteEdition(editionId: string): Promise<ActionResult> {
  const user = await requireUser();

  const edition = await db.edition.findUnique({
    where: { id: editionId },
    select: { id: true, workId: true, isDefault: true },
  });
  if (!edition) return { error: "Édition introuvable." };

  const workId = edition.workId;
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
    select: { id: true, workId: true },
  });
  if (!edition) return { error: "Édition introuvable." };

  const workId = edition.workId;
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

/**
 * L'édition que je lis (D8) — donnée de suivi, ouverte à chacun.
 *
 * Changer de tirage change le décompte des tomes : 12 lus sur 14 en Deluxe
 * n'est pas 12 sur 41 chez Glénat, et les tomes cochés dans l'autre édition ne
 * sont pas reportés. Le statut automatique est donc recalculé dans la foulée.
 */
export async function setMyEdition(
  workId: string,
  editionId: string | null,
): Promise<ActionResult> {
  const user = await requireUser();

  if (editionId) {
    const edition = await db.edition.findUnique({
      where: { id: editionId },
      select: { workId: true },
    });
    if (edition?.workId !== workId) return { error: "Édition introuvable." };
  }

  await db.$transaction(async (tx) => {
    await tx.userWork.upsert({
      where: { userId_workId: { userId: user.id, workId } },
      update: { editionId },
      create: { userId: user.id, workId, editionId },
    });
    await recomputeTomesState(tx, user.id, workId);
  });

  revalidateWork(workId);
  return { ok: true };
}

/**
 * « J'ai lu cette édition » (L6, D8) : une entrée de journal, et tous les tomes
 * du tirage marqués comme lus.
 *
 * C'est le geste de l'intégrale du lot 3, devenu général : depuis que les tomes
 * appartiennent à leur édition (lot 6), une intégrale n'est qu'une édition à
 * peu de volumes, et « j'ai tout lu » vaut pour n'importe laquelle.
 */
export async function markEditionRead(
  editionId: string,
  loggedAt?: string | null,
): Promise<ActionResult> {
  const user = await requireUser();

  const edition = await db.edition.findUnique({
    where: { id: editionId },
    select: { id: true, workId: true },
  });
  if (!edition) return { error: "Édition introuvable." };

  const workId = edition.workId;

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
        const read = await markEditionTomesRead(
          tx,
          user.id,
          workId,
          editionId,
        );
        if (read === 0) throw new Error(NO_TOMES);
        await recomputeViewings(tx, user.id, workId);
      },
      { timeout: 30_000 },
    );
  } catch (e) {
    if (e instanceof Error && e.message === NO_TOMES) {
      return {
        error:
          "Cette édition n'a encore aucun tome : déclarez-en le nombre d'abord.",
      };
    }
    throw e;
  }

  revalidateWork(workId);
  return { ok: true };
}
