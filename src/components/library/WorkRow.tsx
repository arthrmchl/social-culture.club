import Link from "next/link";
import { CoverPlaceholder } from "@/components/CoverPlaceholder";
import { Card } from "@/components/ui/Card";
import { StarDisplay } from "@/components/Stars";
import { TagPills } from "@/components/tags/TagPills";
import { MEDIA, formatYear } from "@/lib/media";
import { stateLabel } from "@/lib/status";
import type { WorkStatusState, WorkType } from "@/generated/prisma/enums";

export type WorkRowData = {
  id: string;
  type: WorkType;
  titleFr: string;
  year: number | null;
  coverImageId: string | null;
  state: WorkStatusState | null;
  rating: number | null;
  liked: boolean;
  tags: { name: string; slug: string }[];
};

/**
 * Vue « liste » de la bibliothèque (S12) : la même œuvre que `WorkCard`, mais
 * avec ce qu'une grille de visuels ne peut pas montrer — statut, note, tags.
 */
export function WorkRow({ work }: { work: WorkRowData }) {
  const cover = work.coverImageId ? `/api/uploads/${work.coverImageId}` : null;

  return (
    <Card className="flex items-center gap-3 p-3">
      <Link
        href={`/oeuvre/${work.id}`}
        className="h-16 w-11 shrink-0 overflow-hidden rounded border border-border bg-elevated"
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={`Visuel de ${work.titleFr}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <CoverPlaceholder title={work.titleFr} type={work.type} />
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          href={`/oeuvre/${work.id}`}
          className="block truncate text-sm font-medium hover:text-accent"
        >
          {work.titleFr}
        </Link>
        <p className="text-xs text-muted">
          {MEDIA[work.type].emoji} {formatYear(work.year)}
          {work.state ? ` · ${stateLabel(work.type, work.state)}` : ""}
        </p>
        {work.tags.length > 0 && (
          <TagPills
            tags={work.tags}
            className="mt-1.5 flex flex-wrap gap-1.5"
          />
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {work.liked && <span aria-label="J'aime">❤️</span>}
        {work.rating != null && <StarDisplay score={work.rating} />}
      </div>
    </Card>
  );
}
