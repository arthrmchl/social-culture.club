import { MediaFilter } from "@/components/MediaFilter";
import {
  JournalEntryCard,
  type JournalEntryCardData,
} from "@/components/JournalEntryCard";
import { EmptyState } from "@/components/ui/Card";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isWorkType } from "@/lib/media";
import type { WorkType } from "@/generated/prisma/enums";

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const user = await requireUser();
  const { type } = await searchParams;
  const workType: WorkType | undefined =
    type && isWorkType(type) ? type : undefined;

  const entries = await db.journalEntry.findMany({
    where: {
      userId: user.id,
      ...(workType ? { work: { type: workType } } : {}),
    },
    orderBy: [
      { loggedAt: { sort: "desc", nulls: "last" } },
      { createdAt: "desc" },
    ],
    take: 100,
    include: {
      season: { select: { number: true } },
      episode: { select: { number: true } },
      tome: { select: { number: true } },
      work: {
        select: { id: true, type: true, titleFr: true, coverImageId: true },
      },
    },
  });

  const data: JournalEntryCardData[] = entries.map((e) => ({
    id: e.id,
    loggedAt: e.loggedAt,
    datePrecision: e.datePrecision,
    rating: e.rating,
    reviewText: e.reviewText,
    reviewHasSpoiler: e.reviewHasSpoiler,
    isRewatch: e.isRewatch,
    isSeasonBatch: e.isSeasonBatch,
    context: e.context,
    season: e.season,
    episode: e.episode,
    tome: e.tome,
    work: e.work,
  }));

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold">Journal</h1>
      <MediaFilter basePath="/journal" current={workType} />

      {data.length > 0 ? (
        <div className="flex flex-col gap-2">
          {data.map((e) => (
            <JournalEntryCard key={e.id} entry={e} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Journal vide"
          description="Consignez un visionnage ou une lecture depuis une fiche d'œuvre."
        />
      )}
    </div>
  );
}
