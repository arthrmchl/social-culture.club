import Link from "next/link";
import { db } from "@/lib/db";
import { resolveCovers } from "@/lib/cover-loader";
import { requireUser } from "@/lib/session";
import { libraryParams, parseLibraryQuery } from "@/lib/library";
import { MediaFilter } from "@/components/MediaFilter";
import { WorkGrid } from "@/components/WorkCard";
import { EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { LibraryFilters } from "@/components/library/LibraryFilters";
import { WorkRow, type WorkRowData } from "@/components/library/WorkRow";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Ma bibliothèque" };

/** Combien d'œuvres au plus : au-delà, la page cesse d'être consultable. */
const LIMIT = 200;

/**
 * Ma bibliothèque (S12) — **mes** œuvres, à ne pas confondre avec
 * `/catalogue`, qui montre les fiches de toute l'instance (D29).
 */
export default async function BibliothequePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const query = parseLibraryQuery(sp);

  const where: Prisma.UserWorkWhereInput = {
    userId: user.id,
    ...(query.state ? { state: query.state } : {}),
    ...(query.minScore != null
      ? { currentRating: { gte: query.minScore } }
      : {}),
    work: {
      ...(query.type ? { type: query.type } : {}),
      ...(query.year ? { year: query.year } : {}),
      ...(query.genre
        ? { genres: { some: { genre: { slug: query.genre } } } }
        : {}),
      ...(query.tag
        ? { tags: { some: { tag: { userId: user.id, slug: query.tag } } } }
        : {}),
    },
  };

  const [rows, genres, tags] = await Promise.all([
    db.userWork.findMany({
      where,
      orderBy: orderBy(query.sort),
      take: LIMIT,
      select: {
        state: true,
        currentRating: true,
        liked: true,
        work: {
          select: {
            id: true,
            type: true,
            titleFr: true,
            titleOriginal: true,
            year: true,
            endYear: true,
            coverImageId: true,
            needsCompletion: true,
            tags: {
              where: { tag: { userId: user.id } },
              select: { tag: { select: { name: true, slug: true } } },
            },
          },
        },
      },
    }),
    // Les facettes ne proposent que ce qui existe dans ma bibliothèque :
    // filtrer sur un genre qui ne rendrait rien n'a pas d'intérêt.
    db.genre.findMany({
      where: {
        works: { some: { work: { userWorks: { some: { userId: user.id } } } } },
      },
      orderBy: { name: "asc" },
      take: 30,
      select: { name: true, slug: true },
    }),
    db.tag.findMany({
      where: { userId: user.id, works: { some: {} } },
      orderBy: { name: "asc" },
      take: 30,
      select: { name: true, slug: true },
    }),
  ]);

  const covers = await resolveCovers(
    rows.map((r) => r.work),
    user.id,
  );

  const items: WorkRowData[] = rows.map((r) => ({
    id: r.work.id,
    type: r.work.type,
    titleFr: r.work.titleFr,
    year: r.work.year,
    endYear: r.work.endYear,
    coverImageId: covers.get(r.work.id),
    state: r.state,
    rating: r.currentRating,
    liked: r.liked,
    tags: r.work.tags.map((t) => t.tag),
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Ma bibliothèque</h1>
          <p className="mt-1 text-sm text-muted">
            {items.length}
            {items.length === LIMIT ? "+" : ""} œuvre
            {items.length > 1 ? "s" : ""} que je suis.{" "}
            <Link href="/catalogue" className="text-accent hover:underline">
              Explorer le catalogue partagé
            </Link>
          </p>
        </div>
        <Link href="/creer">
          <Button size="sm">➕ Ajouter</Button>
        </Link>
      </div>

      <MediaFilter
        basePath="/bibliotheque"
        current={query.type}
        params={libraryParams(query)}
      />

      <LibraryFilters query={query} genres={genres} tags={tags} />

      {items.length > 0 ? (
        query.view === "liste" ? (
          <div className="flex flex-col gap-2">
            {items.map((w) => (
              <WorkRow key={w.id} work={w} />
            ))}
          </div>
        ) : (
          <WorkGrid works={rows.map((r) => r.work)} />
        )
      ) : (
        <EmptyState
          title="Rien ici"
          description="Aucune de vos œuvres ne correspond à ces filtres. Une œuvre entre dans votre bibliothèque dès que vous lui donnez un statut, une note ou une entrée de journal."
          action={
            <Link href="/catalogue">
              <Button>Explorer le catalogue</Button>
            </Link>
          }
        />
      )}
    </div>
  );
}

/** Traduction du tri en clause Prisma — le seul endroit qui la connaisse. */
function orderBy(
  sort: ReturnType<typeof parseLibraryQuery>["sort"],
): Prisma.UserWorkOrderByWithRelationInput[] {
  switch (sort) {
    case "titre":
      return [{ work: { titleNormalized: "asc" } }];
    case "note":
      return [{ currentRating: { sort: "desc", nulls: "last" } }];
    case "annee":
      return [{ work: { year: { sort: "desc", nulls: "last" } } }];
    case "ajout":
      return [{ createdAt: "desc" }];
    case "recent":
      return [{ updatedAt: "desc" }];
  }
}
