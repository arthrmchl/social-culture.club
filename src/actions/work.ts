"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { normalizeTitle, slugify } from "@/lib/text";
import { buildSeasons, buildTomes } from "@/lib/generators";
import { findDuplicateWorks, type DuplicateCandidate } from "@/lib/search";
import { WORK_TYPES } from "@/lib/media";
import type { WorkType } from "@/generated/prisma/enums";

const currentYear = new Date().getFullYear();

const workSchema = z.object({
  type: z.enum(WORK_TYPES as [WorkType, ...WorkType[]]),
  titleFr: z.string().min(1, "Titre requis.").max(300),
  titleOriginal: z.string().max(300).optional(),
  year: z.coerce
    .number()
    .int()
    .min(1800, "Année invalide.")
    .max(currentYear + 5, "Année invalide."),
  coverImageId: z.string().min(1, "Un visuel est obligatoire (D31)."),
  synopsis: z.string().max(5000).optional(),
  durationMinutes: z.coerce.number().int().positive().optional(),
  pageCount: z.coerce.number().int().positive().optional(),
  isbn: z.string().max(20).optional(),
  format: z.string().max(20).optional(), // animés : TV/OAV/ONA/SPECIAL
  genres: z.string().optional(), // séparés par des virgules
  creators: z.string().optional(), // séparés par des virgules
  // générateurs de sous-unités
  seasonsCount: z.coerce.number().int().min(0).max(100).optional(),
  episodesPerSeason: z.coerce.number().int().min(0).max(500).optional(),
  tomesCount: z.coerce.number().int().min(0).max(500).optional(),
});

function splitList(raw?: string): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
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

  const parsed = workSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Champs invalides." };
  }
  const d = parsed.data;

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
        year: d.year,
        synopsis: d.synopsis || null,
        durationMinutes: d.durationMinutes ?? null,
        pageCount: d.pageCount ?? null,
        isbn: d.isbn || null,
        metadata,
        coverImageId: d.coverImageId,
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
    for (const name of creatorNames) {
      const nameNormalized = normalizeTitle(name);
      const person = await tx.person.upsert({
        where: { nameNormalized },
        update: {},
        create: { name, nameNormalized },
      });
      await tx.workCreator.create({
        data: { workId: created.id, personId: person.id, role: null },
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

    if (
      (d.type === "BD_SERIES" || d.type === "MANGA_SERIES") &&
      (d.tomesCount ?? 0) > 0
    ) {
      const tomes = buildTomes(d.tomesCount!);
      await tx.tome.createMany({
        data: tomes.map((t) => ({ workId: created.id, number: t.number })),
      });
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
      tomes: true,
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
        year: source.year,
        synopsis: source.synopsis,
        durationMinutes: source.durationMinutes,
        pageCount: source.pageCount,
        isbn: source.isbn,
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
        tomes: {
          create: source.tomes.map((t) => ({
            number: t.number,
            title: t.title,
            pageCount: t.pageCount,
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

const editSchema = workSchema
  .pick({
    titleFr: true,
    titleOriginal: true,
    year: true,
    synopsis: true,
    durationMinutes: true,
    pageCount: true,
    isbn: true,
    coverImageId: true,
    genres: true,
    creators: true,
    format: true,
  })
  .partial({ coverImageId: true });

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
    return { error: "Seul le créateur ou l'administrateur peut modifier cette fiche." };
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

  await db.$transaction(async (tx) => {
    await tx.work.update({
      where: { id: workId },
      data: {
        titleFr: d.titleFr ?? work.titleFr,
        titleOriginal: d.titleOriginal ?? work.titleOriginal,
        titleNormalized: d.titleFr
          ? normalizeTitle(d.titleFr)
          : work.titleNormalized,
        year: d.year ?? work.year,
        synopsis: d.synopsis ?? work.synopsis,
        durationMinutes: d.durationMinutes ?? work.durationMinutes,
        pageCount: d.pageCount ?? work.pageCount,
        isbn: d.isbn ?? work.isbn,
        coverImageId: d.coverImageId || work.coverImageId,
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
    for (const name of splitList(d.creators)) {
      const nameNormalized = normalizeTitle(name);
      const person = await tx.person.upsert({
        where: { nameNormalized },
        update: {},
        create: { name, nameNormalized },
      });
      await tx.workCreator.create({
        data: { workId, personId: person.id, role: null },
      });
    }
  });

  revalidatePath(`/oeuvre/${workId}`);
  redirect(`/oeuvre/${workId}`);
}
