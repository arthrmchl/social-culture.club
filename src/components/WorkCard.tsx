import Link from "next/link";
import { MEDIA, formatYear } from "@/lib/media";
import type { WorkType } from "@/generated/prisma/enums";
import {
  CoverPlaceholder,
  NeedsCompletionBadge,
} from "@/components/CoverPlaceholder";
import { cn } from "@/lib/utils";

export type WorkCardData = {
  id: string;
  type: WorkType;
  titleFr: string;
  titleOriginal?: string | null;
  year: number | null;
  coverImageId?: string | null;
  needsCompletion?: boolean;
};

function coverUrl(work: WorkCardData): string | null {
  return work.coverImageId ? `/api/uploads/${work.coverImageId}` : null;
}

export function WorkCard({ work }: { work: WorkCardData }) {
  const media = MEDIA[work.type];
  const url = coverUrl(work);

  return (
    <Link
      href={`/oeuvre/${work.id}`}
      className="group flex flex-col gap-2 focus-visible:outline-none"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-[var(--radius)] border border-border bg-elevated">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`Visuel de ${work.titleFr}`}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <CoverPlaceholder title={work.titleFr} type={work.type} />
        )}
        <span
          className="absolute left-1.5 top-1.5 rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur"
          aria-hidden
        >
          {media.emoji} {media.label}
        </span>
        {work.needsCompletion && (
          <NeedsCompletionBadge className="absolute bottom-1.5 left-1.5" />
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium group-hover:text-accent">
          {work.titleFr}
        </p>
        <p className="text-xs text-muted">{formatYear(work.year)}</p>
      </div>
    </Link>
  );
}

export function WorkGrid({
  works,
  className,
}: {
  works: WorkCardData[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6",
        className,
      )}
    >
      {works.map((w) => (
        <WorkCard key={w.id} work={w} />
      ))}
    </div>
  );
}
