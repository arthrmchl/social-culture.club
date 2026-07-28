import Link from "next/link";
import { ReviewContent } from "@/components/ReviewContent";
import { StarDisplay } from "@/components/Stars";
import { CoverPlaceholder } from "@/components/CoverPlaceholder";
import { formatDate } from "@/lib/dates";
import { formatYear } from "@/lib/media";
import type { PublicReview } from "@/lib/social/read";

/**
 * Bandeau d'un contenu masqué par la modération (D25).
 *
 * N'apparaît que pour son auteur et l'administrateur : les autres ne voient
 * simplement rien. On ne fait pas disparaître un écrit sans le dire à celui qui
 * l'a écrit.
 */
export function HiddenBanner({ what }: { what: string }) {
  return (
    <p className="mb-2 rounded-[var(--radius)] border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
      {what} — vous seul et l&apos;administration la voyez encore.
    </p>
  );
}

/** La critique d'une œuvre par un membre (S7), telle qu'un tiers la lit. */
export function ReviewCard({
  review,
  username,
  showWork = true,
  footer,
}: {
  review: PublicReview;
  username: string;
  showWork?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <article className="flex gap-3 rounded-[var(--radius)] border border-border bg-surface p-3">
      {showWork && (
        <Link href={`/oeuvre/${review.work.id}`} className="shrink-0">
          <div className="aspect-[2/3] w-12 overflow-hidden rounded-md border border-border bg-elevated">
            {review.work.coverImageId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/uploads/${review.work.coverImageId}`}
                alt={review.work.titleFr}
                className="h-full w-full object-cover"
              />
            ) : (
              <CoverPlaceholder
                title={review.work.titleFr}
                type={review.work.type}
              />
            )}
          </div>
        </Link>
      )}

      <div className="min-w-0 flex-1">
        {review.hiddenAt && (
          <HiddenBanner what="Critique masquée par la modération" />
        )}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {showWork && (
            <Link
              href={`/u/${username}/critique/${review.work.id}`}
              className="font-medium hover:text-accent"
            >
              {review.work.titleFr}
            </Link>
          )}
          <span className="text-xs text-muted">
            {formatYear(review.work.year)}
          </span>
          {review.reviewedAt && (
            <span className="text-xs text-muted">
              · {formatDate(review.reviewedAt)}
            </span>
          )}
          {review.liked && (
            <span className="text-xs text-accent" title="Aimé">
              ♥
            </span>
          )}
        </div>

        {review.rating != null && (
          <div className="mt-1 text-sm">
            <StarDisplay score={review.rating} />
          </div>
        )}

        <div className="mt-2">
          <ReviewContent
            text={review.reviewText}
            hasSpoiler={review.reviewHasSpoiler}
          />
        </div>

        {footer && <div className="mt-2">{footer}</div>}
      </div>
    </article>
  );
}
