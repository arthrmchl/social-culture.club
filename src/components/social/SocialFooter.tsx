import Link from "next/link";
import { describeComments } from "@/lib/comments";
import type { SocialCounts } from "@/lib/social/read";
import type { SocialTarget } from "@/lib/social-target";
import { ReportDialog } from "./ReportDialog";
import { SocialLikeButton } from "./SocialLikeButton";

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
  canReport = false,
}: {
  target: SocialTarget;
  counts: SocialCounts;
  href?: string | null;
  /** Faux sur son propre contenu : on ne se signale pas soi-même. */
  canReport?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
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
      {canReport && <ReportDialog subject={{ kind: "content", target }} />}
    </div>
  );
}
