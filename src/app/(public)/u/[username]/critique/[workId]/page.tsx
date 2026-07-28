import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Avatar } from "@/components/social/ProfileHeader";
import { CommentThread } from "@/components/social/CommentThread";
import { ReviewCard } from "@/components/social/ReviewCard";
import { SocialFooter } from "@/components/social/SocialFooter";
import {
  getComments,
  getPublicReview,
  getSocialCounts,
} from "@/lib/social/read";

type Props = { params: Promise<{ username: string; workId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `Critique de @${username}`,
    robots: { index: false, follow: false },
  };
}

/**
 * Le permalien d'une critique d'œuvre (P3).
 *
 * Désignée par l'œuvre et non par l'identifiant du `UserWork` : un membre n'a
 * qu'une critique courante par œuvre, et l'URL reste lisible.
 */
export default async function ReviewPermalinkPage({ params }: Props) {
  const { username, workId } = await params;

  const view = await getPublicReview(username, workId);
  if (!view) notFound();

  const { profile } = view.author;
  // La cible est le UserWork, pas l'œuvre : on commente ce qu'un membre a
  // écrit, jamais une fiche du catalogue partagé.
  const target = { kind: "review" as const, id: view.review.id };
  const [counts, comments] = await Promise.all([
    getSocialCounts(target, profile.id),
    getComments(target, profile.id),
  ]);
  // On ne signale pas son propre contenu, ni sans compte.
  const canReport =
    counts.canInteract && view.author.viewer?.id !== view.author.profile.id;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/u/${username}/critiques`}
        className="flex items-center gap-2 text-sm text-muted hover:text-accent"
      >
        <Avatar name={profile.name} image={profile.image} size="sm" />
        <span>
          Critiques de {profile.name}
          {profile.username && (
            <span className="text-xs"> · @{profile.username}</span>
          )}
        </span>
      </Link>

      <ReviewCard
        review={view.review}
        username={username}
        footer={
          <SocialFooter
            target={target}
            counts={counts}
            canReport={canReport}
          />
        }
      />

      <CommentThread
        target={target}
        comments={comments}
        canInteract={counts.canInteract}
      />
    </div>
  );
}
