import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { resolveCovers } from "@/lib/cover-loader";
import { requireUser } from "@/lib/session";
import { Card } from "@/components/ui/Card";
import { WorkGrid } from "@/components/WorkCard";
import {
  JournalEntryCard,
  type JournalEntryCardData,
} from "@/components/JournalEntryCard";

/** Page par étiquette (S10) : les œuvres et les entrées qui la portent. */
export default async function TagPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser();

  const tag = await db.tag.findUnique({
    where: { userId_slug: { userId: user.id, slug } },
    select: { id: true, name: true },
  });
  if (!tag) notFound();

  const [workTags, entryTags] = await Promise.all([
    db.workTag.findMany({
      where: { tagId: tag.id },
      orderBy: { createdAt: "desc" },
      select: {
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
          },
        },
      },
    }),
    db.journalEntryTag.findMany({
      where: { tagId: tag.id },
      select: {
        entry: {
          select: {
            id: true,
            loggedAt: true,
            datePrecision: true,
            rating: true,
            reviewText: true,
            reviewHasSpoiler: true,
            isRewatch: true,
            isSeasonBatch: true,
            context: true,
            season: { select: { number: true } },
            episode: { select: { number: true } },
            tome: { select: { number: true } },
            work: {
              select: {
                id: true,
                type: true,
                titleFr: true,
                coverImageId: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const covers = await resolveCovers(
    [...workTags.map((wt) => wt.work), ...entryTags.map((et) => et.entry.work)],
    user.id,
  );

  const works = workTags.map((wt) => ({
    ...wt.work,
    coverImageId: covers.get(wt.work.id),
  }));
  const entries: JournalEntryCardData[] = entryTags
    .map((et) => ({
      ...et.entry,
      work: { ...et.entry.work, coverImageId: covers.get(et.entry.work.id) },
    }))
    // Le tri par date se fait ici : trier sur une relation imbriquée coûterait
    // une requête moins lisible pour un volume qui tient en mémoire.
    .sort(
      (a, b) => (b.loggedAt?.getTime() ?? 0) - (a.loggedAt?.getTime() ?? 0),
    );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/tags" className="text-sm text-muted hover:text-accent">
          ← Mes étiquettes
        </Link>
        <h1 className="mt-2 text-2xl font-bold">#{tag.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {works.length} œuvre{works.length > 1 ? "s" : ""} · {entries.length}{" "}
          entrée{entries.length > 1 ? "s" : ""} de journal
        </p>
      </div>

      {works.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Œuvres
          </h2>
          <WorkGrid works={works} />
        </section>
      )}

      {entries.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Journal
          </h2>
          <div className="flex flex-col gap-2">
            {entries.map((e) => (
              <JournalEntryCard key={e.id} entry={e} />
            ))}
          </div>
        </section>
      )}

      {works.length === 0 && entries.length === 0 && (
        <Card className="p-4 text-sm text-muted">
          Cette étiquette n&apos;est plus posée nulle part.
        </Card>
      )}
    </div>
  );
}
