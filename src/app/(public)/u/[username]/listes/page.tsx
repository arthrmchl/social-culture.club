import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProfileHeader } from "@/components/social/ProfileHeader";
import { PublicWorkCover } from "@/components/social/PublicWorkGrid";
import { Card, EmptyState } from "@/components/ui/Card";
import { describeList } from "@/lib/lists";
import { getPublicLists } from "@/lib/social/read";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `Listes de @${username}`,
    robots: { index: false, follow: false },
  };
}

export default async function ListesPubliquesPage({ params }: Props) {
  const { username } = await params;

  const view = await getPublicLists(username);
  if (!view) notFound();

  const { access, profile } = view.author;

  return (
    <div>
      <ProfileHeader
        author={profile}
        tab="listes"
        sections={{
          journal: access.canSeeJournal,
          reviews: access.canSeeReviews,
          lists: access.canSeeLists,
        }}
        follows={null}
      />

      {view.lists.length === 0 ? (
        <EmptyState
          title="Aucune liste"
          description="Ce membre n'a pas encore de liste visible."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {view.lists.map((l) => (
            <li key={l.id}>
              <Link href={`/u/${username}/listes/${l.slug}`}>
                <Card className="flex gap-3 p-3 transition-colors hover:bg-elevated">
                  <div className="flex shrink-0 gap-1">
                    {l.covers.slice(0, 3).map((w) => (
                      <div key={w.id} className="w-10">
                        <PublicWorkCover work={w} />
                      </div>
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {l.title}
                      {l.isPinned && (
                        <span className="text-xs text-accent" title="Épinglée">
                          📌
                        </span>
                      )}
                      {/* Visibles du seul auteur : getPublicLists ne les
                          renvoie qu'à lui et à l'administration. */}
                      {l.isPrivate && (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
                          Privée
                        </span>
                      )}
                      {l.hiddenAt && (
                        <span className="rounded-full border border-danger/40 px-2 py-0.5 text-[11px] text-danger">
                          Masquée
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {describeList(l.items, l.isRanked)}
                    </p>
                    {l.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted">
                        {l.description}
                      </p>
                    )}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
