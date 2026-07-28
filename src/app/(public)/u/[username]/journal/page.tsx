import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { JournalEntryCard } from "@/components/JournalEntryCard";
import { HiddenBanner } from "@/components/social/ReviewCard";
import { ProfileHeader } from "@/components/social/ProfileHeader";
import { EmptyState } from "@/components/ui/Card";
import { isWorkType, MEDIA, MEDIA_ORDER } from "@/lib/media";
import { getPublicJournal } from "@/lib/social/read";
import type { WorkType } from "@/generated/prisma/enums";

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ type?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `Journal de @${username}`,
    robots: { index: false, follow: false },
  };
}

export default async function JournalPublicPage({
  params,
  searchParams,
}: Props) {
  const { username } = await params;
  const { type } = await searchParams;
  // Une valeur inconnue est ramenée au défaut plutôt que rejetée — une URL
  // bricolée à la main n'a pas à produire d'erreur (règle du lot 3).
  const workType: WorkType | undefined =
    type && isWorkType(type) ? type : undefined;

  const view = await getPublicJournal(username, { type: workType });
  if (!view) notFound();

  const { access, profile } = view.author;

  return (
    <div>
      <ProfileHeader
        author={profile}
        tab="journal"
        sections={{
          journal: access.canSeeJournal,
          reviews: access.canSeeReviews,
          lists: access.canSeeLists,
        }}
        follows={null}
      />

      {/* Facettes en liens : chaque combinaison est une URL partageable. */}
      <nav
        aria-label="Filtrer par média"
        className="mb-4 flex flex-wrap gap-2 text-sm"
      >
        <Link
          href={`/u/${username}/journal`}
          className={
            workType
              ? "rounded-full border border-border px-3 py-1 text-muted hover:bg-elevated"
              : "rounded-full border border-accent bg-elevated px-3 py-1 text-accent"
          }
        >
          Tout
        </Link>
        {MEDIA_ORDER.map((t) => (
          <Link
            key={t}
            href={`/u/${username}/journal?type=${t}`}
            className={
              workType === t
                ? "rounded-full border border-accent bg-elevated px-3 py-1 text-accent"
                : "rounded-full border border-border px-3 py-1 text-muted hover:bg-elevated"
            }
          >
            {MEDIA[t].emoji} {MEDIA[t].plural}
          </Link>
        ))}
      </nav>

      {view.entries.length === 0 ? (
        <EmptyState
          title="Aucune entrée"
          description="Ce membre n'a rien consigné ici pour l'instant."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {view.entries.map((e) => (
            <li key={e.id}>
              {e.hiddenAt && (
                <HiddenBanner what="Entrée masquée par la modération" />
              )}
              <Link
                href={`/u/${username}/journal/${e.id}`}
                className="mb-1 block text-xs text-muted hover:text-accent"
              >
                Voir l&apos;entrée et ses réactions →
              </Link>
              {/* canDelete={false} : on affiche l'entrée d'autrui. */}
              <JournalEntryCard entry={e} canDelete={false} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
