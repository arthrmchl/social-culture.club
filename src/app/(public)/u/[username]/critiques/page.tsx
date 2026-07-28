import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ProfileHeader } from "@/components/social/ProfileHeader";
import { ReviewCard } from "@/components/social/ReviewCard";
import { EmptyState } from "@/components/ui/Card";
import { getPublicReviews } from "@/lib/social/read";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `Critiques de @${username}`,
    robots: { index: false, follow: false },
  };
}

export default async function CritiquesPubliquesPage({ params }: Props) {
  const { username } = await params;

  const view = await getPublicReviews(username);
  if (!view) notFound();

  const { access, profile } = view.author;

  return (
    <div>
      <ProfileHeader
        author={profile}
        tab="critiques"
        sections={{
          journal: access.canSeeJournal,
          reviews: access.canSeeReviews,
          lists: access.canSeeLists,
        }}
        follows={null}
      />

      {view.reviews.length === 0 ? (
        <EmptyState
          title="Aucune critique"
          description="Ce membre n'a pas encore écrit sur ses œuvres."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {view.reviews.map((r) => (
            <li key={r.id}>
              <ReviewCard review={r} username={username} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
