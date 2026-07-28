import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { JournalEntryCard } from "@/components/JournalEntryCard";
import { CommentThread } from "@/components/social/CommentThread";
import { HiddenBanner } from "@/components/social/ReviewCard";
import { Avatar } from "@/components/social/ProfileHeader";
import { SocialFooter } from "@/components/social/SocialFooter";
import { getComments, getPublicEntry, getSocialCounts } from "@/lib/social/read";

type Props = { params: Promise<{ username: string; entryId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `Entrée de @${username}`,
    robots: { index: false, follow: false },
  };
}

/**
 * Le permalien d'une entrée de journal (P3).
 *
 * C'est ici que se rattacheront j'aime et commentaires : une cible sociale a
 * besoin d'un écran à elle, sans quoi une notification n'aurait nulle part où
 * mener.
 */
export default async function EntryPermalinkPage({ params }: Props) {
  const { username, entryId } = await params;

  const view = await getPublicEntry(username, entryId);
  if (!view) notFound();

  const { profile } = view.author;
  const target = { kind: "entry" as const, id: view.entry.id };
  const [counts, comments] = await Promise.all([
    getSocialCounts(target, profile.id),
    getComments(target, profile.id),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/u/${username}/journal`}
        className="flex items-center gap-2 text-sm text-muted hover:text-accent"
      >
        <Avatar name={profile.name} image={profile.image} size="sm" />
        <span>
          Journal de {profile.name}
          {profile.username && (
            <span className="text-xs"> · @{profile.username}</span>
          )}
        </span>
      </Link>

      {view.entry.hiddenAt && (
        <HiddenBanner what="Entrée masquée par la modération" />
      )}

      <JournalEntryCard
        entry={view.entry}
        canDelete={false}
        footer={<SocialFooter target={target} counts={counts} />}
      />

      <CommentThread
        target={target}
        comments={comments}
        canInteract={counts.canInteract}
      />
    </div>
  );
}
