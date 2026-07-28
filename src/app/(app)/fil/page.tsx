import Link from "next/link";
import { FeedCard } from "@/components/social/FeedCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { isWorkType, MEDIA, MEDIA_ORDER } from "@/lib/media";
import { requireUser } from "@/lib/session";
import { getFeed } from "@/lib/social/feed-query";
import type { WorkType } from "@/generated/prisma/enums";

export const metadata = { title: "Mon fil" };

/**
 * Le fil des abonnements (P2).
 *
 * Facettes et pagination en liens, pas en état client : chaque page du fil est
 * une URL, dans la continuité des facettes du lot 3. Le curseur y voyage en
 * clair — `decodeCursor` ne lève jamais, une valeur bricolée ramène simplement
 * à la première page.
 */
export default async function FilPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; curseur?: string }>;
}) {
  await requireUser();
  const { type, curseur } = await searchParams;
  const workType: WorkType | undefined =
    type && isWorkType(type) ? type : undefined;

  const feed = await getFeed("following", { cursor: curseur, type: workType });

  const params = (patch: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const next = { type: workType, curseur, ...patch };
    if (next.type) sp.set("type", next.type);
    if (next.curseur) sp.set("curseur", next.curseur);
    const q = sp.toString();
    return q ? `/fil?${q}` : "/fil";
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Mon fil</h1>
        <Link href="/decouvrir" className="text-sm text-muted hover:text-accent">
          Découvrir d&apos;autres membres →
        </Link>
      </div>

      <nav
        aria-label="Filtrer par média"
        className="flex flex-wrap gap-2 text-sm"
      >
        <Link
          href={params({ type: undefined, curseur: undefined })}
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
            href={params({ type: t, curseur: undefined })}
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

      {feed.items.length === 0 ? (
        <EmptyState
          title="Rien à lire pour l'instant"
          description="Votre fil rassemble l'activité des membres que vous suivez. Les imports n'y apparaissent pas — ils noieraient tout."
          action={
            <Link href="/decouvrir">
              <Button>Trouver des membres à suivre</Button>
            </Link>
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-4">
            {feed.items.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <FeedCard item={item} payload={feed.payload} />
              </li>
            ))}
          </ul>

          {feed.nextCursor && (
            <Link
              href={params({ curseur: feed.nextCursor })}
              className="self-center"
            >
              <Button variant="secondary">Voir la suite</Button>
            </Link>
          )}
        </>
      )}
    </div>
  );
}
