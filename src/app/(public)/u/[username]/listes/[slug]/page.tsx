import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Avatar } from "@/components/social/ProfileHeader";
import { CommentThread } from "@/components/social/CommentThread";
import { PublicWorkCover } from "@/components/social/PublicWorkGrid";
import { HiddenBanner } from "@/components/social/ReviewCard";
import { SocialFooter } from "@/components/social/SocialFooter";
import { EmptyState } from "@/components/ui/Card";
import { describeList } from "@/lib/lists";
import { formatYears } from "@/lib/media";
import { getComments, getPublicList, getSocialCounts } from "@/lib/social/read";

type Props = { params: Promise<{ username: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `Liste de @${username}`,
    robots: { index: false, follow: false },
  };
}

/** Le permalien d'une liste (S9, P3 — cible sociale). */
export default async function ListePubliquePage({ params }: Props) {
  const { username, slug } = await params;

  const view = await getPublicList(username, slug);
  if (!view) notFound();

  const { profile } = view.author;
  const { list } = view;
  const target = { kind: "list" as const, id: list.id };
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
        href={`/u/${username}/listes`}
        className="flex items-center gap-2 text-sm text-muted hover:text-accent"
      >
        <Avatar name={profile.name} image={profile.image} size="sm" />
        <span>
          Listes de {profile.name}
          {profile.username && (
            <span className="text-xs"> · @{profile.username}</span>
          )}
        </span>
      </Link>

      {list.hiddenAt && <HiddenBanner what="Liste masquée par la modération" />}

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{list.title}</h1>
        <p className="text-sm text-muted">
          {describeList(list.items, list.isRanked)}
        </p>
        {list.description && (
          <p className="mt-2 text-sm text-muted">{list.description}</p>
        )}
        <div className="mt-2">
          <SocialFooter target={target} counts={counts} canReport={canReport} />
        </div>
      </div>

      {list.entries.length === 0 ? (
        <EmptyState title="Liste vide" description="Rien n'y est encore rangé." />
      ) : (
        <ol className="flex flex-col gap-2">
          {list.entries.map((item, index) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-surface p-2"
            >
              {list.isRanked && (
                <span className="w-6 shrink-0 text-center text-sm font-semibold text-muted">
                  {index + 1}
                </span>
              )}
              <div className="w-10 shrink-0">
                <PublicWorkCover work={item.work} />
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/oeuvre/${item.work.id}`}
                  className="font-medium hover:text-accent"
                >
                  {item.work.titleFr}
                </Link>
                <span className="ml-2 text-xs text-muted">
                  {formatYears(item.work)}
                </span>
                {item.note && (
                  <p className="mt-0.5 text-sm text-muted">{item.note}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <CommentThread
        target={target}
        comments={comments}
        canInteract={counts.canInteract}
      />
    </div>
  );
}
