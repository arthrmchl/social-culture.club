"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { normalizeTitle, slugify, splitList } from "@/lib/text";
import { upsertPersonIds } from "@/lib/people";
import { buildSeasons } from "@/lib/generators";
import { findDuplicateWorks, type DuplicateCandidate } from "@/lib/search";
import { normalizeLanguage } from "@/lib/languages";
import { isSerial, WORK_TYPES, worksOwnCover } from "@/lib/media";
import type { WorkType } from "@/generated/prisma/enums";

const currentYear = new Date().getFullYear();

const workSchema = z.object({
  type: z.enum(WORK_TYPES as [WorkType, ...WorkType[]]),
  titleFr: z.string().min(1, "Titre requis.").max(300),
  titleOriginal: z.string().max(300).optional(),
  originalLanguage: z.string().max(40).optional(),
  year: z.coerce
    .number()
    .int()
    .min(1800, "Année invalide.")
    .max(currentYear + 5, "Année invalide."),
  /// Œuvres sérielles seulement, et facultative : son absence déclare une
  /// publication **en cours** (lot 6).
  endYear: z.coerce
    .number()
    .int()
    .min(1800, "Année de fin invalide.")
    .max(currentYear + 5, "Année de fin invalide.")
    .optional(),
  // D31 ne vaut que pour les médias qui portent leur visuel : celui d'un livre,
  // d'une BD ou d'un manga appartient à ses éditions (voir `requireCover`).
  coverImageId: z.string().optional(),
  synopsis: z.string().max(5000).optional(),
  durationMinutes: z.coerce.number().int().positive().optional(),
  format: z.string().max(20).optional(), // animés : TV/OAV/ONA/SPECIAL
  genres: z.string().optional(), // séparés par des virgules
  creators: z.string().optional(), // séparés par des virgules
  // générateurs de sous-unités
  seasonsCount: z.coerce.number().int().min(0).max(100).optional(),
  episodesPerSeason: z.coerce.number().int().min(0).max(500).optional(),
  // Pas de générateur de tomes : le nombre de volumes décrit une édition
  // (lot 6), il se saisit sur elle.
});

/**
 * Une série ne peut pas finir avant d'avoir commencé. Vérifié à part du champ
 * lui-même, qui ne connaît pas l'autre.
 */
function checkYears<T extends { year?: number; endYear?: number }>(
  schema: z.ZodType<T>,
) {
  return schema.refine((d) => !d.endYear || !d.year || d.endYear >= d.year, {
    message: "L'année de fin doit suivre l'année de début.",
    path: ["endYear"],
  });
}

const createSchema = checkYears(workSchema);

/** Le visuel de la fiche, ou l'erreur D31 quand le média doit en porter un. */
function requireCover(
  type: WorkType,
  coverImageId: string | undefined,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (!worksOwnCover(type)) return { ok: true, value: null };
  if (!coverImageId) {
    return { ok: false, error: "Un visuel est obligatoire (D31)." };
  }
  return { ok: true, value: coverImageId };
}

/**
 * Le rôle des créateurs saisis. Un livre et un manga ont des auteur·rice·s ;
 * une BD a un scénariste et un dessinateur, qu'un rôle unique trahirait — on
 * n'en met donc aucun tant que la saisie ne les distingue pas.
 */
function creatorRole(type: WorkType): string | null {
  return type === "BOOK" || type === "MANGA_SERIES" ? "auteur" : null;
}

/** FormData -> objet, en ignorant les champs vides (sinon z.coerce("") = 0). */
function formToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string" && v !== "") out[k] = v;
  }
  return out;
}

/** Détection de doublons à la volée (appelée depuis le formulaire). */
export async function detectDuplicates(
  title: string,
  year: number,
): Promise<DuplicateCandidate[]> {
  await requireUser();
  if (!title || !Number.isFinite(year)) return [];
  return findDuplicateWorks(title, year);
}

export type WorkFormState = { error: string } | undefined;

export async function createWork(
  _prev: WorkFormState,
  formData: FormData,
): Promise<WorkFormState | never> {
  const user = await requireUser();

  const parsed = createSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Champs invalides." };
  }
  const d = parsed.data;

  const cover = requireCover(d.type, d.coverImageId);
  if (!cover.ok) return { error: cover.error };

  const genreNames = splitList(d.genres);
  const creatorNames = splitList(d.creators);

  const metadata: Record<string, string> = {};
  if (d.type === "ANIME" && d.format) metadata.format = d.format;

  const work = await db.$transaction(async (tx) => {
    const created = await tx.work.create({
      data: {
        type: d.type,
        titleFr: d.titleFr,
        titleOriginal: d.titleOriginal || null,
        titleNormalized: normalizeTitle(d.titleFr),
        originalLanguage: normalizeLanguage(d.originalLanguage),
        year: d.year,
        endYear: isSerial(d.type) ? (d.endYear ?? null) : null,
        synopsis: d.synopsis || null,
        durationMinutes: d.durationMinutes ?? null,
        metadata,
        coverImageId: cover.value,
        createdById: user.id,
      },
    });

    // Genres (upsert + connexion)
    for (const name of genreNames) {
      const genre = await tx.genre.upsert({
        where: { name },
        update: {},
        create: { name, slug: slugify(name) },
      });
      await tx.workGenre.create({
        data: { workId: created.id, genreId: genre.id },
      });
    }

    // Créateurs (upsert Person par nom normalisé + connexion)
    const role = creatorRole(d.type);
    for (const personId of await upsertPersonIds(tx, creatorNames)) {
      await tx.workCreator.create({
        data: { workId: created.id, personId, role },
      });
    }

    // Générateurs de sous-unités (S2)
    if (
      (d.type === "SERIES" || d.type === "ANIME") &&
      (d.seasonsCount ?? 0) > 0
    ) {
      const seasons = buildSeasons(d.seasonsCount!, d.episodesPerSeason ?? 0);
      for (const s of seasons) {
        await tx.season.create({
          data: {
            workId: created.id,
            number: s.number,
            episodes: {
              create: s.episodes.map((e) => ({ number: e.number })),
            },
          },
        });
      }
    }

    return created;
  });

  revalidatePath("/catalogue");
  redirect(`/oeuvre/${work.id}`);
}

/** Duplique une fiche existante comme point de départ (S2). */
export async function duplicateWork(sourceId: string): Promise<never> {
  const user = await requireUser();
  const source = await db.work.findUnique({
    where: { id: sourceId },
    include: {
      genres: true,
      creators: true,
      seasons: { include: { episodes: true } },
      // Les tomes voyagent avec leur édition (lot 6), jamais seuls.
      editions: { include: { creators: true, tomes: true } },
    },
  });
  if (!source) redirect("/catalogue");

  const copy = await db.$transaction(async (tx) => {
    const created = await tx.work.create({
      data: {
        type: source.type,
        titleFr: `${source.titleFr} (copie)`,
        titleOriginal: source.titleOriginal,
        titleNormalized: normalizeTitle(`${source.titleFr} copie`),
        originalLanguage: source.originalLanguage,
        year: source.year,
        endYear: source.endYear,
        synopsis: source.synopsis,
        durationMinutes: source.durationMinutes,
        metadata: source.metadata as object,
        coverImageId: source.coverImageId,
        createdById: user.id,
        genres: {
          create: source.genres.map((g) => ({ genreId: g.genreId })),
        },
        creators: {
          create: source.creators.map((c) => ({
            personId: c.personId,
            role: c.role,
          })),
        },
        // Sans elles, la copie d'une lecture naîtrait sans visuel, sans
        // pagination et sans tome : tout cela vit sur l'édition (lots 5 et 6).
        editions: {
          create: source.editions.map((e) => ({
            title: e.title,
            language: e.language,
            isbn: e.isbn,
            pageCount: e.pageCount,
            publisher: e.publisher,
            format: e.format,
            isDefault: e.isDefault,
            coverImageId: e.coverImageId,
            creators: {
              create: e.creators.map((c) => ({
                personId: c.personId,
                role: c.role,
              })),
            },
            tomes: {
              create: e.tomes.map((t) => ({
                number: t.number,
                title: t.title,
                pageCount: t.pageCount,
              })),
            },
          })),
        },
      },
    });
    for (const s of source.seasons) {
      await tx.season.create({
        data: {
          workId: created.id,
          number: s.number,
          title: s.title,
          episodes: {
            create: s.episodes.map((e) => ({
              number: e.number,
              title: e.title,
              durationMinutes: e.durationMinutes,
            })),
          },
        },
      });
    }
    return created;
  });

  redirect(`/oeuvre/${copy.id}/modifier`);
}

/**
 * Suppression d'une fiche — réservée à l'administrateur.
 * Les données rattachées (sous-unités, suivi, journal de tous les
 * utilisateurs) sont supprimées en cascade au niveau base (onDelete: Cascade).
 */
export async function deleteWork(
  workId: string,
): Promise<{ error: string } | never> {
  const user = await requireUser();
  if (!isAdmin(user)) {
    return { error: "Seul l'administrateur peut supprimer une fiche." };
  }

  const work = await db.work.findUnique({
    where: { id: workId },
    select: { id: true },
  });
  if (!work) return { error: "Fiche introuvable." };

  await db.work.delete({ where: { id: workId } });

  revalidatePath("/catalogue");
  redirect("/catalogue");
}

const editSchema = checkYears(
  workSchema.pick({
    titleFr: true,
    titleOriginal: true,
    originalLanguage: true,
    year: true,
    endYear: true,
    synopsis: true,
    durationMinutes: true,
    coverImageId: true,
    genres: true,
    creators: true,
    format: true,
  }),
);

/** Édition d'une fiche — réservée au créateur et à l'administrateur (D30). */
export async function editWork(
  workId: string,
  _prev: WorkFormState,
  formData: FormData,
): Promise<WorkFormState | never> {
  const user = await requireUser();
  const work = await db.work.findUnique({ where: { id: workId } });
  if (!work) return { error: "Fiche introuvable." };
  if (work.createdById !== user.id && !isAdmin(user)) {
    return {
      error: "Seul le créateur ou l'administrateur peut modifier cette fiche.",
    };
  }

  const parsed = editSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Champs invalides." };
  }
  const d = parsed.data;

  const metadata =
    work.type === "ANIME" && d.format
      ? { ...(work.metadata as object), format: d.format }
      : (work.metadata as object);

  // Un média de lecture ne porte plus de visuel (lot 5) : celui d'une fiche
  // antérieure au découpage œuvre/édition n'est pas reconduit.
  const coverImageId = worksOwnCover(work.type)
    ? d.coverImageId || work.coverImageId
    : null;
  const year = d.year ?? work.year;
  // Seul champ que l'on peut **vider** : `formToObject` écarte les chaînes
  // vides, donc `d.endYear ?? work.endYear` interdirait de corriger une fin
  // saisie par erreur. Une série qui reprend redevient « en cours ».
  const endYear = isSerial(work.type) ? (d.endYear ?? null) : null;

  await db.$transaction(async (tx) => {
    await tx.work.update({
      where: { id: workId },
      data: {
        titleFr: d.titleFr ?? work.titleFr,
        titleOriginal: d.titleOriginal ?? work.titleOriginal,
        titleNormalized: d.titleFr
          ? normalizeTitle(d.titleFr)
          : work.titleNormalized,
        originalLanguage:
          normalizeLanguage(d.originalLanguage) ?? work.originalLanguage,
        year,
        endYear,
        synopsis: d.synopsis ?? work.synopsis,
        durationMinutes: d.durationMinutes ?? work.durationMinutes,
        coverImageId,
        // Une fiche importée cesse d'être « à compléter » dès qu'elle a une
        // année et, pour les médias qui en portent un, un visuel (I1).
        needsCompletion:
          work.needsCompletion &&
          (year === null || (worksOwnCover(work.type) && !coverImageId)),
        metadata,
      },
    });

    // Remplace les genres et créateurs (simple pour le lot 0).
    await tx.workGenre.deleteMany({ where: { workId } });
    for (const name of splitList(d.genres)) {
      const genre = await tx.genre.upsert({
        where: { name },
        update: {},
        create: { name, slug: slugify(name) },
      });
      await tx.workGenre.create({ data: { workId, genreId: genre.id } });
    }

    await tx.workCreator.deleteMany({ where: { workId } });
    const role = creatorRole(work.type);
    for (const personId of await upsertPersonIds(tx, splitList(d.creators))) {
      await tx.workCreator.create({ data: { workId, personId, role } });
    }
  });

  revalidatePath(`/oeuvre/${workId}`);
  redirect(`/oeuvre/${workId}`);
}
