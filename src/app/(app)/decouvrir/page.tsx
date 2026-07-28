import Link from "next/link";
import { FeedCard } from "@/components/social/FeedCard";
import { MemberList } from "@/components/social/MemberList";
import { PublicWorkCover } from "@/components/social/PublicWorkGrid";
import { EmptyState } from "@/components/ui/Card";
import { formatYear } from "@/lib/media";
import { requireUser } from "@/lib/session";
import { getDiscoverData, RECENT_DAYS, type PopularWork } from "@/lib/social/discover";
import { getFeed } from "@/lib/social/feed-query";

export const metadata = { title: "Découvrir" };

/**
 * Découvrir (P2).
 *
 * Trois blocs : les membres à suivre, l'activité publique récente, et les
 * œuvres populaires de l'instance. D24 autorisait à reporter cette page tant
 * que le cercle reste privé ; elle est livrée parce qu'elle est le seul endroit
 * d'où l'on puisse trouver quelqu'un à suivre — sans elle, le fil reste vide et
 * l'abonnement n'a pas de porte d'entrée.
 */
export default async function DecouvrirPage() {
  const user = await requireUser();

  const [feed, discover] = await Promise.all([
    getFeed("discover", { limit: 10 }),
    getDiscoverData(user.id),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Découvrir</h1>
        <Link href="/fil" className="text-sm text-muted hover:text-accent">
          Revenir à mon fil →
        </Link>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Membres à suivre
        </h2>
        <MemberList
          members={discover.members}
          empty={{
            title: "Personne à suggérer",
            description:
              "Vous suivez déjà tous les membres visibles de l'instance.",
          }}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Activité publique récente
        </h2>
        {feed.items.length === 0 ? (
          <EmptyState
            title="Rien de public pour l'instant"
            description="Personne n'a encore publié d'activité visible sur cette instance."
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {feed.items.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <FeedCard item={item} payload={feed.payload} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <PopularSection
        title="Les plus suivies"
        hint="Les œuvres que le plus de membres ont dans leur bibliothèque."
        rows={discover.tracked}
        unit="membres"
      />

      <PopularSection
        title="Ce qui se voit en ce moment"
        hint={`Les œuvres les plus consignées ces ${RECENT_DAYS} derniers jours.`}
        rows={discover.recent}
        unit="entrées"
      />
    </div>
  );
}

function PopularSection({
  title,
  hint,
  rows,
  unit,
}: {
  title: string;
  hint: string;
  rows: PopularWork[];
  unit: string;
}) {
  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
      </h2>
      <p className="mb-2 text-xs text-muted">{hint}</p>
      {rows.length === 0 ? (
        <EmptyState
          title="Rien à montrer"
          description="Le catalogue de l'instance est encore trop jeune."
        />
      ) : (
        <ul className="grid grid-cols-4 gap-3 sm:grid-cols-6">
          {rows.map(({ work, count }) => (
            <li key={work.id}>
              <PublicWorkCover work={work} />
              <p className="mt-1 truncate text-[11px]">{work.titleFr}</p>
              <p className="truncate text-[11px] text-muted">
                {count} {unit} · {formatYear(work.year)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
