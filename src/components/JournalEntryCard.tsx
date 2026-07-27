import Link from "next/link";
import { MEDIA } from "@/lib/media";
import { formatLoggedDate } from "@/lib/dates";
import { StarDisplay } from "./Stars";
import { ReviewContent } from "./ReviewContent";
import { DeleteEntryButton } from "./JournalEntryActions";
import type { WorkType, DatePrecision } from "@/generated/prisma/enums";

export type JournalEntryCardData = {
  id: string;
  loggedAt: Date | null;
  datePrecision: DatePrecision;
  rating: number | null;
  reviewText: string | null;
  reviewHasSpoiler: boolean;
  isRewatch: boolean;
  isSeasonBatch: boolean;
  context: string | null;
  season: { number: number } | null;
  episode: { number: number } | null;
  tome: { number: number } | null;
  work: {
    id: string;
    type: WorkType;
    titleFr: string;
    coverImageId: string | null;
  };
};

function subUnitLabel(e: JournalEntryCardData): string | null {
  if (e.season) return `Saison ${e.season.number}`;
  if (e.episode) return `Épisode ${e.episode.number}`;
  if (e.tome) return `Tome ${e.tome.number}`;
  return null;
}

/** Une entrée du journal (S4). `showWork` ajoute la vignette de l'œuvre (vue globale). */
export function JournalEntryCard({
  entry,
  showWork = true,
}: {
  entry: JournalEntryCardData;
  showWork?: boolean;
}) {
  const media = MEDIA[entry.work.type];
  const cover = entry.work.coverImageId
    ? `/api/uploads/${entry.work.coverImageId}`
    : null;
  const sub = subUnitLabel(entry);

  return (
    <div className="flex gap-3 rounded-[var(--radius)] border border-border bg-surface p-3">
      {showWork && (
        <Link href={`/oeuvre/${entry.work.id}`} className="shrink-0">
          <div className="aspect-[2/3] w-12 overflow-hidden rounded-md border border-border bg-elevated">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt={entry.work.titleFr}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-lg opacity-40">
                {media.emoji}
              </div>
            )}
          </div>
        </Link>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {showWork && (
            <Link
              href={`/oeuvre/${entry.work.id}`}
              className="font-medium hover:text-accent"
            >
              {entry.work.titleFr}
            </Link>
          )}
          <span className="text-xs text-muted">
            {formatLoggedDate(entry.loggedAt, entry.datePrecision)}
          </span>
          {sub && (
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
              {sub}
            </span>
          )}
          {entry.isRewatch && (
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
              ↻ Revu
            </span>
          )}
          {entry.context && (
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
              {entry.context}
            </span>
          )}
        </div>

        {entry.rating != null && (
          <div className="mt-1 text-sm">
            <StarDisplay score={entry.rating} />
          </div>
        )}

        {entry.reviewText && (
          <div className="mt-2">
            <ReviewContent
              text={entry.reviewText}
              hasSpoiler={entry.reviewHasSpoiler}
            />
          </div>
        )}

        <div className="mt-2">
          <DeleteEntryButton entryId={entry.id} />
        </div>
      </div>
    </div>
  );
}
