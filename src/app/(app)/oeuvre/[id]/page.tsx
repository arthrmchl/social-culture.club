import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, isAdmin } from "@/lib/session";
import {
  MEDIA,
  usesEpisodes,
  usesTomes,
  usesPages,
  isReading,
  formatYear,
} from "@/lib/media";
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
import { CoverPlaceholder } from "@/components/CoverPlaceholder";
import { ReadingProgressWidget } from "@/components/ReadingProgressWidget";
import { AddToListButton } from "@/components/lists/AddToListButton";
import { FavoriteButton } from "@/components/FavoriteButton";
import { TagInput } from "@/components/tags/TagInput";
import { TagPills } from "@/components/tags/TagPills";
import { QuoteSection, type QuoteData } from "@/components/quotes/QuoteSection";
import {
  EditionSection,
  type EditionData,
} from "@/components/editions/EditionSection";
import { CorrectionDialog } from "@/components/social/CorrectionDialog";
import { CorrectionQueue } from "@/components/social/CorrectionQueue";
import { pageCountFor } from "@/lib/editions";
import { pickCoverImageId } from "@/lib/covers";
import { languageLabel } from "@/lib/languages";
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
      editions: {
        orderBy: { createdAt: "asc" },
        include: {
          creators: { include: { person: { select: { name: true } } } },
        },
      },
      createdBy: { select: { name: true } },
    },
  });
  if (!work) notFound();

  const [
    userWork,
    watches,
    tomeProgress,
    userSeasons,
    entries,
    contextRows,
    listMemberships,
    workTags,
    quotes,
    favorite,
  ] = await Promise.all([
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
    db.listItem.findMany({
      where: { workId: id, list: { userId: user.id } },
      select: { list: { select: { slug: true, title: true } } },
      orderBy: { list: { title: "asc" } },
    }),
    db.workTag.findMany({
      where: { workId: id, tag: { userId: user.id } },
      select: { tag: { select: { name: true, slug: true } } },
      orderBy: { tag: { name: "asc" } },
    }),
    db.quote.findMany({
      where: { userId: user.id, workId: id },
      orderBy: [{ page: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        text: true,
        page: true,
        note: true,
        tome: { select: { number: true } },
      },
    }),
    db.favorite.findUnique({
      where: { userId_workId: { userId: user.id, workId: id } },
      select: { id: true },
    }),
  ]);

  const media = MEDIA[work.type];
  const canEdit = work.createdById === user.id || isAdmin(user);

  // Propositions de correction en attente (D30) — visibles de ceux qui peuvent
  // les appliquer, c'est-à-dire exactement ceux qui peuvent éditer la fiche.
  const corrections = canEdit
    ? await db.correctionSuggestion.findMany({
        where: { workId: work.id, status: "OPEN" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          field: true,
          message: true,
          createdAt: true,
          author: { select: { name: true, username: true } },
        },
      })
    : [];
  // La couverture d'une lecture appartient à ses éditions (lot 5) : mon
  // édition d'abord, celle par défaut ensuite, la vignette générée sinon.
  const coverImageId = pickCoverImageId(
    work,
    work.editions,
    userWork?.editionId,
  );
  const cover = coverImageId ? `/api/uploads/${coverImageId}` : null;
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
      coverImageId,
    },
  }));

  const viewingCount = entries.length;
  const editionItems: EditionData[] = work.editions.map((e) => ({
    ...e,
    translators: e.creators.map((c) => c.person.name),
  }));
  const readingPageCount = pageCountFor(work.editions, userWork?.editionId);
  const originalLanguage = languageLabel(work.originalLanguage);
  const tags = workTags.map((wt) => wt.tag);
  const quoteItems: QuoteData[] = quotes.map((q) => ({
    id: q.id,
    text: q.text,
    page: q.page,
    note: q.note,
    tomeNumber: q.tome?.number ?? null,
  }));

  return (
    <div className="flex flex-col gap-8">
      {/* Fiche importée à compléter (lot 2, I1) */}
      {work.needsCompletion && (
        <Card className="flex flex-col gap-3 border-accent/40 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Fiche à compléter</p>
            <p className="text-sm text-muted">
              Importée depuis un service externe : il lui manque au moins une
              information — son année, et son visuel pour les médias qui en
              portent un.
            </p>
          </div>
          {canEdit && (
            <Link href={`/oeuvre/${work.id}/modifier`}>
              <Button size="sm">Compléter</Button>
            </Link>
          )}
        </Card>
      )}

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
              <CoverPlaceholder title={work.titleFr} type={work.type} />
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
            {readingPageCount ? ` · ${readingPageCount} pages` : ""}
            {originalLanguage ? ` · ${originalLanguage}` : ""}
          </p>

          {work.creators.length > 0 && (
            <p className="mt-3 text-sm">
              <span className="text-muted">
                {work.type === "BOOK" ? "Auteur·rice(s) : " : "Créateurs : "}
              </span>
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
              // D30 : le contrepoids au droit d'édition réservé au créateur.
              <CorrectionDialog workId={work.id} />
            )}
            {isAdmin(user) && (
              <DeleteWorkButton workId={work.id} title={work.titleFr} />
            )}
          </div>

          {canEdit && <CorrectionQueue corrections={corrections} />}
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
            <FavoriteButton workId={work.id} isFavorite={favorite !== null} />
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

      {/* Éditions (lot 3, L6, D8) — le modèle dormait en base depuis le lot 0 */}
      {isReading(work.type) && (
        <section>
          <SectionTitle>Éditions</SectionTitle>
          <EditionSection
            workId={work.id}
            editions={editionItems}
            myEditionId={userWork?.editionId ?? null}
            canEdit={canEdit}
            hasTomes={work.tomes.length > 0}
          />
        </section>
      )}

      {/* Étiquettes (lot 3, S10) */}
      <section>
        <SectionTitle>Mes étiquettes</SectionTitle>
        <div className="flex flex-col gap-3">
          <TagPills tags={tags} />
          <TagInput target={{ kind: "work", id: work.id }} tags={tags} />
        </div>
      </section>

      {/* Citations (lot 3, L3 — lectures uniquement, D9) */}
      {isReading(work.type) && (
        <section>
          <SectionTitle>Citations</SectionTitle>
          <QuoteSection
            workId={work.id}
            quotes={quoteItems}
            tomes={work.tomes.map((t) => ({ id: t.id, number: t.number }))}
          />
        </section>
      )}

      {/* Listes (lot 3, S9) */}
      <section>
        <SectionTitle>Mes listes</SectionTitle>
        <div className="flex flex-col gap-3">
          {listMemberships.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {listMemberships.map((m) => (
                <Link
                  key={m.list.slug}
                  href={`/listes/${m.list.slug}`}
                  className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted hover:bg-elevated"
                >
                  📋 {m.list.title}
                </Link>
              ))}
            </div>
          )}
          <AddToListButton workId={work.id} />
        </div>
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
              // La pagination suit l'édition lue quand elle est précisée (D8).
              pageCount={readingPageCount}
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
