import Link from "next/link";
import { JournalEntryCard } from "@/components/JournalEntryCard";
import { PublicWorkCover } from "@/components/social/PublicWorkGrid";
import { ReviewCard } from "@/components/social/ReviewCard";
import { Card } from "@/components/ui/Card";
import { describeList } from "@/lib/lists";
import { Avatar } from "./ProfileHeader";
import type { FeedItem } from "@/lib/feed";
import type { FeedPayload } from "@/lib/social/feed-query";

/**
 * Une carte de fil (P2).
 *
 * La carte est la même pour une entrée et pour une critique — c'est le
 * permalien qui diffère, `/u/x/journal/<id>` ou `/u/x/critique/<workId>`. C'est
 * précisément pourquoi la déduplication (`dedupeReviewAndEntry`) doit être
 * déterministe : on ne peut pas rattacher j'aime et commentaires à deux objets
 * dont un seul est montré.
 */
export function FeedCard({
  item,
  payload,
  footer,
}: {
  item: FeedItem;
  payload: FeedPayload;
  /** Gestes sociaux, branchés au permalien affiché. */
  footer?: React.ReactNode;
}) {
  const author = payload.authors.get(item.authorId);
  if (!author) return null;

  const header = (
    <div className="mb-2 flex items-center gap-2 text-sm">
      <Avatar name={author.name} image={author.image} size="sm" />
      {author.username ? (
        <Link href={`/u/${author.username}`} className="hover:text-accent">
          <span className="font-medium">{author.name}</span>
          <span className="ml-1 text-xs text-muted">@{author.username}</span>
        </Link>
      ) : (
        <span className="font-medium">{author.name}</span>
      )}
      <span className="text-xs text-muted">{verb(item.kind)}</span>
    </div>
  );

  if (item.kind === "entry") {
    const e = payload.entries.get(item.id);
    if (!e) return null;
    return (
      <div>
        {header}
        {author.username && (
          <Link
            href={`/u/${author.username}/journal/${e.id}`}
            className="mb-1 block text-xs text-muted hover:text-accent"
          >
            Voir l&apos;entrée →
          </Link>
        )}
        <JournalEntryCard entry={e} canDelete={false} footer={footer} />
      </div>
    );
  }

  if (item.kind === "review") {
    const r = payload.reviews.get(item.id);
    if (!r) return null;
    return (
      <div>
        {header}
        <ReviewCard
          review={{
            id: r.id,
            rating: r.currentRating,
            reviewText: r.reviewText ?? "",
            reviewHasSpoiler: r.reviewHasSpoiler,
            reviewedAt: r.reviewedAt,
            liked: r.liked,
            hiddenAt: r.hiddenAt,
            work: r.work,
          }}
          username={author.username ?? ""}
          footer={footer}
        />
      </div>
    );
  }

  const l = payload.lists.get(item.id);
  if (!l) return null;
  return (
    <div>
      {header}
      <Card className="flex gap-3 p-3">
        <div className="flex shrink-0 gap-1">
          {l.items.slice(0, 3).map((i) => (
            <div key={i.work.id} className="w-10">
              <PublicWorkCover work={i.work} />
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          {author.username ? (
            <Link
              href={`/u/${author.username}/listes/${l.slug}`}
              className="font-medium hover:text-accent"
            >
              {l.title}
            </Link>
          ) : (
            <span className="font-medium">{l.title}</span>
          )}
          <p className="text-xs text-muted">
            {describeList(l._count.items, l.isRanked)}
          </p>
          {l.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted">
              {l.description}
            </p>
          )}
          {footer && <div className="mt-2">{footer}</div>}
        </div>
      </Card>
    </div>
  );
}

function verb(kind: FeedItem["kind"]): string {
  switch (kind) {
    case "entry":
      return "a consigné";
    case "review":
      return "a écrit une critique";
    case "list":
      return "a créé une liste";
  }
}
