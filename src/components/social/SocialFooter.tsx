import { SocialLikeButton } from "./SocialLikeButton";
import type { SocialCounts } from "@/lib/social/read";
import type { SocialTarget } from "@/lib/social-target";
import { describeComments } from "@/lib/comments";
import Link from "next/link";

/**
 * La barre de gestes sous une carte sociale (P3).
 *
 * Sur un permalien, les commentaires sont déjà dépliés en dessous — on n'y
 * répète qu'un compteur. Dans un fil, `href` renvoie vers le permalien : c'est
 * là, et seulement là, que se rattachent j'aime et commentaires.
 */
export function SocialFooter({
  target,
  counts,
  href,
}: {
  target: SocialTarget;
  counts: SocialCounts;
  href?: string | null;
}) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted">
      <SocialLikeButton
        target={target}
        initialCount={counts.likes}
        initialLiked={counts.likedByMe}
        canInteract={counts.canInteract}
      />
      {href ? (
        <Link href={href} className="hover:text-accent">
          💬 {describeComments(counts.comments)}
        </Link>
      ) : (
        <span>💬 {describeComments(counts.comments)}</span>
      )}
    </div>
  );
}
