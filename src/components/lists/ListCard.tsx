import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { describeList } from "@/lib/lists";
import { MEDIA } from "@/lib/media";
import type { WorkType } from "@/generated/prisma/enums";

export type ListCardData = {
  slug: string;
  title: string;
  description: string | null;
  isRanked: boolean;
  isPinned: boolean;
  coverImageId: string | null;
  count: number;
  /** Les médias réellement présents — le « multi-médias » se constate (D11). */
  types: WorkType[];
};

/** Vignette d'une liste dans `/listes` et sur l'accueil. */
export function ListCard({ list }: { list: ListCardData }) {
  const cover = list.coverImageId ? `/api/uploads/${list.coverImageId}` : null;

  return (
    <Link href={`/listes/${list.slug}`} className="group">
      <Card className="flex h-full gap-3 p-3 transition-colors hover:border-accent">
        <div className="size-16 shrink-0 overflow-hidden rounded-[var(--radius)] border border-border bg-elevated">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-2xl"
              aria-hidden
            >
              📋
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium group-hover:text-accent">
            {list.isPinned && <span aria-label="Épinglée">📌 </span>}
            {list.title}
          </p>
          <p className="text-xs text-muted">
            {describeList(list.count, list.isRanked)}
          </p>
          {list.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted">
              {list.description}
            </p>
          )}
          {list.types.length > 0 && (
            <p className="mt-1 text-xs" aria-hidden>
              {list.types.map((t) => MEDIA[t].emoji).join(" ")}
            </p>
          )}
        </div>
      </Card>
    </Link>
  );
}
