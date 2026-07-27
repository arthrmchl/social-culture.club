import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import { MEDIA, usesEpisodes, usesTomes, usesPages, formatYear } from "@/lib/media";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusSelect } from "@/components/StatusSelect";
import { RatingStars } from "@/components/RatingStars";
import { LikeButton } from "@/components/LikeButton";
import { ReviewEditor } from "@/components/ReviewEditor";
import { ReviewContent } from "@/components/ReviewContent";
import { JournalEntryForm } from "@/components/JournalEntryForm";
import { DeleteWorkButton } from "@/components/DeleteWorkButton";
import { EpisodeTracker } from "@/components/EpisodeTracker";
import { TomeTracker } from "@/components/TomeTracker";
import { ReadingProgressWidget } from "@/components/ReadingProgressWidget";
import {
  JournalEntryCard,
  type JournalEntryCardData,
} from "@/components/JournalEntryCard";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
      {children}
    </h2>
  );
}

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
        include: { episodes: { orderBy: { number: "asc" } } },
      },
      tomes: { orderBy: { number: "asc" } },
      editions: { orderBy: { createdAt: "asc" } },
      createdBy: { select: { name: true } },
    },
  });
  if (!work) notFound();

  const [userWork, watches, tomeProgress, userSeasons, entries, contextRows] =
    await Promise.all([
      db.userWork.findUnique({
        where: { userId_workId: { userId: user.id, workId: id } },
      }),
      db.episodeWatch.findMany({
        where: { userId: user.id, episode: { season: { workId: id } } },
        select: { episodeId: true },
      }),
      db.tomeProgress.findMany({
        where: { userId: user.id, tome: { workId: id } },
        select: { tomeId: true, state: true },
      }),
      db.userSeason.findMany({
        where: { userId: user.id, season: { workId: id } },
      }),
      db.journalEntry.findMany({
        where: { userId: user.id, workId: id },
        orderBy: [
          { loggedAt: { sort: "desc", nulls: "last" } },
          { createdAt: "desc" },
        ],
        include: {
          season: { select: { number: true } },
          episode: { select: { number: true } },
          tome: { select: { number: true } },
        },
      }),
      db.journalEntry.findMany({
        where: { userId: user.id, context: { not: null } },
        select: { context: true },
        distinct: ["context"],
        take: 20,
      }),
    ]);

  const media = MEDIA[work.type];
  const canEdit = work.createdById === user.id || isAdmin(user);
  const cover = work.coverImageId ? `/api/uploads/${work.coverImageId}` : null;
  const totalEpisodes = work.seasons.reduce((n, s) => n + s.episodes.length, 0);

  const watchedSet = new Set(watches.map((w) => w.episodeId));
  const tomeStateMap = new Map(tomeProgress.map((t) => [t.tomeId, t.state]));
  const userSeasonMap = new Map(userSeasons.map((s) => [s.seasonId, s]));
  const contextSuggestions = contextRows
    .map((c) => c.context)
    .filter((c): c is string => !!c);

  const seasonItems = work.seasons.map((s) => ({
    id: s.id,
    number: s.number,
    title: s.title,
    episodes: s.episodes.map((e) => ({
      id: e.id,
      number: e.number,
      title: e.title,
      watched: watchedSet.has(e.id),
    })),
    rating: userSeasonMap.get(s.id)?.rating ?? null,
    reviewText: userSeasonMap.get(s.id)?.reviewText ?? null,
    reviewHasSpoiler: userSeasonMap.get(s.id)?.reviewHasSpoiler ?? false,
  }));

  const tomeItems = work.tomes.map((t) => ({
    id: t.id,
    number: t.number,
    state: tomeStateMap.get(t.id) ?? null,
  }));

  const journalEntries: JournalEntryCardData[] = entries.map((e) => ({
    id: e.id,
    loggedAt: e.loggedAt,
    datePrecision: e.datePrecision,
    rating: e.rating,
    reviewText: e.reviewText,
    reviewHasSpoiler: e.reviewHasSpoiler,
    isRewatch: e.isRewatch,
    isSeasonBatch: e.isSeasonBatch,
    context: e.context,
    season: e.season,
    episode: e.episode,
    tome: e.tome,
    work: {
      id: work.id,
      type: work.type,
      titleFr: work.titleFr,
      coverImageId: work.coverImageId,
    },
  }));

  const viewingCount = entries.length;

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
            {formatYear(work.year)}
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
            {isAdmin(user) && (
              <DeleteWorkButton workId={work.id} title={work.titleFr} />
            )}
          </div>
        </div>
      </div>

      {work.synopsis && (
        <section>
          <SectionTitle>Synopsis</SectionTitle>
          <p className="whitespace-pre-line text-sm leading-relaxed">
            {work.synopsis}
          </p>
        </section>
      )}

      {/* Ma relation à l'œuvre (lot 1) */}
      <section>
        <SectionTitle>Ma relation à l'œuvre</SectionTitle>
        <Card className="flex flex-col gap-5 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="w-48">
              <StatusSelect
                workId={work.id}
                type={work.type}
                state={userWork?.state ?? null}
              />
            </div>
            <RatingStars
              target={{ kind: "work", id: work.id }}
              score={userWork?.currentRating ?? null}
            />
            <LikeButton workId={work.id} liked={userWork?.liked ?? false} />
          </div>

          {viewingCount > 0 && (
            <p className="text-sm text-muted">
              {usesPages(work.type) || usesTomes(work.type)
                ? `${viewingCount} lecture${viewingCount > 1 ? "s" : ""} au journal`
                : `${viewingCount} visionnage${viewingCount > 1 ? "s" : ""} au journal`}
            </p>
          )}

          {/* Critique directe à l'œuvre (S7) */}
          <div className="flex flex-col gap-2">
            {userWork?.reviewText && (
              <ReviewContent
                text={userWork.reviewText}
                hasSpoiler={userWork.reviewHasSpoiler}
              />
            )}
            <ReviewEditor
              target={{ kind: "work", id: work.id }}
              text={userWork?.reviewText ?? null}
              hasSpoiler={userWork?.reviewHasSpoiler ?? false}
            />
          </div>

          <JournalEntryForm
            workId={work.id}
            contextSuggestions={contextSuggestions}
          />
        </Card>
      </section>

      {/* Progression fine */}
      {usesEpisodes(work.type) && work.seasons.length > 0 && (
        <section>
          <SectionTitle>
            Progression — {work.seasons.length} saison
            {work.seasons.length > 1 ? "s" : ""} · {totalEpisodes} épisode
            {totalEpisodes > 1 ? "s" : ""}
          </SectionTitle>
          <EpisodeTracker workId={work.id} seasons={seasonItems} />
        </section>
      )}

      {usesTomes(work.type) && work.tomes.length > 0 && (
        <section>
          <SectionTitle>Progression — tomes</SectionTitle>
          <TomeTracker tomes={tomeItems} />
        </section>
      )}

      {usesPages(work.type) && (
        <section>
          <SectionTitle>Progression de lecture</SectionTitle>
          <Card className="p-4">
            <ReadingProgressWidget
              workId={work.id}
              currentPage={userWork?.currentPage ?? null}
              currentPercent={userWork?.progressPercent ?? null}
              pageCount={work.pageCount ?? null}
            />
          </Card>
        </section>
      )}

      {/* Journal de l'œuvre (S4) */}
      <section>
        <SectionTitle>Journal</SectionTitle>
        {journalEntries.length > 0 ? (
          <div className="flex flex-col gap-2">
            {journalEntries.map((e) => (
              <JournalEntryCard key={e.id} entry={e} showWork={false} />
            ))}
          </div>
        ) : (
          <Card className="p-4 text-sm text-muted">
            Aucune entrée pour l'instant. Utilisez « Ajouter au journal ».
          </Card>
        )}
      </section>

      <p className="text-xs text-muted">
        Fiche créée par {work.createdBy.name}.
      </p>
    </div>
  );
}
