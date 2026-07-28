import Link from "next/link";
import { WorkGrid } from "@/components/WorkCard";
import { Card, EmptyState } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ReadingProgressWidget } from "@/components/ReadingProgressWidget";
import {
  JournalEntryCard,
  type JournalEntryCardData,
} from "@/components/JournalEntryCard";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { resolveCovers } from "@/lib/cover-loader";
import { MEDIA, MEDIA_ORDER, usesPages } from "@/lib/media";
import { ListCard } from "@/components/lists/ListCard";
import { goalProgress, scopeEmoji, scopeLabel } from "@/lib/goals";
import { countForGoals } from "@/lib/goal-count";

export default async function AccueilPage() {
  const user = await requireUser();
  const year = new Date().getFullYear();

  const [recent, total, inProgress, recentEntries, pinnedLists, goals] =
    await Promise.all([
      db.work.findMany({
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          type: true,
          titleFr: true,
          titleOriginal: true,
          year: true,
          coverImageId: true,
          needsCompletion: true,
        },
      }),
      db.work.count(),
      db.userWork.findMany({
        where: { userId: user.id, state: "IN_PROGRESS" },
        orderBy: { updatedAt: "desc" },
        take: 12,
        include: {
          work: {
            select: {
              id: true,
              type: true,
              titleFr: true,
              titleOriginal: true,
              year: true,
              coverImageId: true,
              needsCompletion: true,
              editions: {
                select: {
                  id: true,
                  pageCount: true,
                  isDefault: true,
                  coverImageId: true,
                },
              },
            },
          },
        },
      }),
      db.journalEntry.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          season: { select: { number: true } },
          episode: { select: { number: true } },
          tome: { select: { number: true } },
          work: {
            select: { id: true, type: true, titleFr: true, coverImageId: true },
          },
        },
      }),
      db.list.findMany({
        where: { userId: user.id, isPinned: true },
        orderBy: { updatedAt: "desc" },
        take: 4,
        select: {
          slug: true,
          title: true,
          description: true,
          isRanked: true,
          isPinned: true,
          coverImageId: true,
          _count: { select: { items: true } },
          items: {
            take: 12,
            orderBy: { position: "asc" },
            select: { work: { select: { type: true } } },
          },
        },
      }),
      db.goal.findMany({
        where: { userId: user.id, year },
        orderBy: { target: "desc" },
        select: { scope: true, target: true },
      }),
    ]);

  // Les compteurs ne sont demandés que pour les portées réellement dotées
  // d'un objectif : inutile de compter neuf fois pour n'en afficher aucune.
  const goalCounts = await countForGoals(
    user.id,
    year,
    goals.map((g) => g.scope),
  );

  // Une seule passe pour toutes les vignettes de la page : la couverture d'une
  // lecture se résout sur ses éditions (lot 5), du point de vue de son lecteur.
  const covers = await resolveCovers(
    [
      ...recent,
      ...inProgress.map((uw) => uw.work),
      ...recentEntries.map((e) => e.work),
    ],
    user.id,
  );
  const withCover = <T extends { id: string }>(w: T) => ({
    ...w,
    coverImageId: covers.get(w.id),
  });

  const reads = inProgress.filter((uw) => usesPages(uw.work.type));
  const watching = inProgress.filter((uw) => !usesPages(uw.work.type));
  const entries: JournalEntryCardData[] = recentEntries.map((e) => ({
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
    work: withCover(e.work),
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Bonjour {user.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {total} œuvre{total > 1 ? "s" : ""} dans le catalogue partagé.
        </p>
      </div>

      {/* Ajout rapide (N1) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Ajouter une œuvre
        </h2>
        <div className="flex flex-wrap gap-2">
          {MEDIA_ORDER.map((t) => (
            <Link key={t} href={`/creer?type=${t}`}>
              <Button variant="secondary" size="sm">
                {MEDIA[t].emoji} {MEDIA[t].label}
              </Button>
            </Link>
          ))}
          <Link href="/watchlist">
            <Button variant="ghost" size="sm">
              🔖 À voir / à lire
            </Button>
          </Link>
        </div>
      </section>

      {/* En cours (S13) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          En cours
        </h2>
        {inProgress.length === 0 ? (
          <Card className="p-4 text-sm text-muted">
            Vos séries à poursuivre et lectures ouvertes apparaîtront ici.
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {reads.length > 0 && (
              <div className="flex flex-col gap-2">
                {reads.map((uw) => {
                  // Pas de saisie sans édition désignée (lot 5) : une page ne
                  // veut rien dire tant qu'on ignore quel tirage est lu.
                  const edition =
                    uw.work.editions.find((e) => e.id === uw.editionId) ?? null;
                  return (
                    <Card
                      key={uw.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3"
                    >
                      <Link
                        href={`/oeuvre/${uw.work.id}`}
                        className="text-sm font-medium hover:text-accent"
                      >
                        {MEDIA[uw.work.type].emoji} {uw.work.titleFr}
                      </Link>
                      {edition ? (
                        <ReadingProgressWidget
                          workId={uw.work.id}
                          editionId={edition.id}
                          currentPage={uw.currentPage}
                          currentPercent={uw.progressPercent}
                          pageCount={edition.pageCount}
                        />
                      ) : (
                        <Link
                          href={`/oeuvre/${uw.work.id}#editions`}
                          className="text-sm text-accent hover:underline"
                        >
                          Préciser l&apos;édition lue
                        </Link>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
            {watching.length > 0 && (
              <WorkGrid works={watching.map((uw) => withCover(uw.work))} />
            )}
          </div>
        )}
      </section>

      {/* Objectifs de l'année (L5, S13) */}
      {goals.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Objectifs {year}
            </h2>
            <Link
              href="/objectifs"
              className="text-sm text-accent hover:underline"
            >
              Régler
            </Link>
          </div>
          <Card className="flex flex-col divide-y divide-border p-0">
            {goals.map((g) => {
              const done = goalCounts[g.scope] ?? 0;
              const progress = goalProgress(done, g.target);
              return (
                <div key={g.scope} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      {scopeEmoji(g.scope)} {scopeLabel(g.scope)}
                    </span>
                    <span className="text-muted">
                      {done} / {g.target}
                      {progress.reached ? " 🎉" : ""}
                    </span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-elevated"
                    role="progressbar"
                    aria-valuenow={progress.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Progression ${scopeLabel(g.scope)}`}
                  >
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </Card>
        </section>
      )}

      {/* Listes épinglées (S9, S13) */}
      {pinnedLists.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Listes épinglées
            </h2>
            <Link
              href="/listes"
              className="text-sm text-accent hover:underline"
            >
              Toutes mes listes
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {pinnedLists.map((l) => (
              <ListCard
                key={l.slug}
                list={{
                  slug: l.slug,
                  title: l.title,
                  description: l.description,
                  isRanked: l.isRanked,
                  isPinned: l.isPinned,
                  coverImageId: l.coverImageId,
                  count: l._count.items,
                  types: [...new Set(l.items.map((i) => i.work.type))],
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Dernières entrées du journal (S13) */}
      {entries.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Dernières entrées
            </h2>
            <Link
              href="/journal"
              className="text-sm text-accent hover:underline"
            >
              Tout le journal
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {entries.map((e) => (
              <JournalEntryCard key={e.id} entry={e} />
            ))}
          </div>
        </section>
      )}

      {/* Derniers ajouts au catalogue */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Derniers ajouts au catalogue
        </h2>
        {recent.length > 0 ? (
          <WorkGrid works={recent.map(withCover)} />
        ) : (
          <EmptyState
            title="Rien pour l'instant"
            description="Lancez le catalogue en créant la première fiche."
            action={
              <Link href="/creer">
                <Button>Créer une œuvre</Button>
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
