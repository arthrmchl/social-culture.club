import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FollowButton } from "@/components/social/FollowButton";
import { ProfileHeader } from "@/components/social/ProfileHeader";
import { PublicWorkGrid } from "@/components/social/PublicWorkGrid";
import { Card, EmptyState } from "@/components/ui/Card";
import { formatDate } from "@/lib/dates";
import { getProfileView } from "@/lib/social/read";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `@${username}`,
    // Le cercle est privé (D24) : les profils se partagent par lien, ils ne
    // s'indexent pas. À rouvrir le jour d'une ouverture large, et pas avant —
    // R9 (visuels protégés) demande le même réexamen.
    robots: { index: false, follow: false },
  };
}

export default async function ProfilPublicPage({ params }: Props) {
  const { username } = await params;

  const view = await getProfileView(username);
  // Compte inexistant, privé, bloqué ou banni : la même réponse. Un 403
  // confirmerait l'existence du compte, et dirait à un bloqué qu'il l'est.
  if (!view) notFound();

  const { access, profile } = view.access;

  return (
    <div>
      <ProfileHeader
        author={profile}
        tab="profil"
        sections={{
          journal: access.canSeeJournal,
          reviews: access.canSeeReviews,
          lists: access.canSeeLists,
        }}
        follows={view.follows}
        action={
          <FollowButton
            targetUserId={profile.id}
            initial={view.myFollow}
          />
        }
      />

      {access.canSeeStats && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            En quelques chiffres
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <Stat value={view.counts.works} label="œuvres suivies" />
            <Stat value={view.counts.entries} label="entrées de journal" />
            <Stat value={view.counts.lists} label="listes" />
          </div>
          <p className="mt-2 text-xs text-muted">
            Membre depuis le {formatDate(profile.createdAt)}
          </p>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Ses favoris
        </h2>
        {view.favorites.length > 0 ? (
          <PublicWorkGrid works={view.favorites} />
        ) : (
          <EmptyState
            title="Aucun favori"
            description="Ce membre n'a pas encore mis d'œuvre en avant."
          />
        )}
      </section>

      {access.canSeeLists && view.pinnedLists.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Ses listes épinglées
          </h2>
          <Card className="flex flex-col divide-y divide-border p-0">
            {view.pinnedLists.map((l) => (
              <Link
                key={l.id}
                href={`/u/${username}/listes/${l.slug}`}
                className="px-4 py-3 text-sm hover:bg-elevated"
              >
                📋 {l.title}
                <span className="block text-xs text-muted">
                  {l.items} {l.items === 1 ? "œuvre" : "œuvres"}
                </span>
              </Link>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <Card className="p-3 text-center">
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </Card>
  );
}
