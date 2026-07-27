import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { MEDIA } from "@/lib/media";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default async function OeuvrePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const work = await db.work.findUnique({
    where: { id },
    include: {
      genres: { include: { genre: true } },
      creators: { include: { person: true } },
      seasons: {
        orderBy: { number: "asc" },
        include: { _count: { select: { episodes: true } } },
      },
      tomes: { orderBy: { number: "asc" } },
      editions: { orderBy: { createdAt: "asc" } },
      createdBy: { select: { name: true } },
    },
  });
  if (!work) notFound();

  const media = MEDIA[work.type];
  const canEdit = work.createdById === user.id || isAdmin(user);
  const cover = work.coverImageId ? `/api/uploads/${work.coverImageId}` : null;
  const totalEpisodes = work.seasons.reduce(
    (n, s) => n + s._count.episodes,
    0,
  );

  return (
    <div className="flex flex-col gap-8">
      {/* En-tête */}
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="mx-auto w-44 shrink-0 sm:mx-0">
          <div className="aspect-[2/3] overflow-hidden rounded-[var(--radius)] border border-border bg-elevated">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt={`Visuel de ${work.titleFr}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-4xl opacity-40">
                {media.emoji}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1">
          <span className="text-sm text-muted">
            {media.emoji} {media.label}
          </span>
          <h1 className="mt-1 text-2xl font-bold">{work.titleFr}</h1>
          {work.titleOriginal && (
            <p className="text-muted">{work.titleOriginal}</p>
          )}
          <p className="mt-1 text-sm text-muted">
            {work.year}
            {work.durationMinutes ? ` · ${work.durationMinutes} min` : ""}
            {work.pageCount ? ` · ${work.pageCount} pages` : ""}
          </p>

          {work.creators.length > 0 && (
            <p className="mt-3 text-sm">
              <span className="text-muted">Créateurs : </span>
              {work.creators.map((c) => c.person.name).join(", ")}
            </p>
          )}

          {work.genres.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {work.genres.map((g) => (
                <Link
                  key={g.genreId}
                  href={`/catalogue?type=${work.type}`}
                  className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted hover:bg-elevated"
                >
                  {g.genre.name}
                </Link>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {canEdit ? (
              <Link href={`/oeuvre/${work.id}/modifier`}>
                <Button variant="secondary" size="sm">
                  Modifier la fiche
                </Button>
              </Link>
            ) : (
              <Button variant="secondary" size="sm" disabled title="Bientôt (lot 4)">
                Proposer une correction
              </Button>
            )}
          </div>
        </div>
      </div>

      {work.synopsis && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Synopsis
          </h2>
          <p className="whitespace-pre-line text-sm leading-relaxed">
            {work.synopsis}
          </p>
        </section>
      )}

      {/* Sous-unités */}
      {work.seasons.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            {work.seasons.length} saison{work.seasons.length > 1 ? "s" : ""} ·{" "}
            {totalEpisodes} épisode{totalEpisodes > 1 ? "s" : ""}
          </h2>
          <Card className="divide-y divide-border">
            {work.seasons.map((s) => (
              <div key={s.id} className="flex justify-between p-3 text-sm">
                <span>Saison {s.number}</span>
                <span className="text-muted">{s._count.episodes} épisodes</span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {work.tomes.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            {work.tomes.length} tome{work.tomes.length > 1 ? "s" : ""}
          </h2>
          <div className="flex flex-wrap gap-2">
            {work.tomes.map((t) => (
              <span
                key={t.id}
                className="rounded-md border border-border px-2 py-1 text-xs"
              >
                T{t.number}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Ma relation à l'œuvre — livrée au lot 1 */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Ma relation à l'œuvre
        </h2>
        <Card className="p-4 text-sm text-muted">
          Journal, note, j'aime, critiques, statut et progression arrivent au
          lot 1.
        </Card>
      </section>

      <p className="text-xs text-muted">
        Fiche créée par {work.createdBy.name}.
      </p>
    </div>
  );
}
