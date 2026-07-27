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
import { MEDIA, MEDIA_ORDER, usesPages } from "@/lib/media";

export default async function AccueilPage() {
  const user = await requireUser();

  const [recent, total, inProgress, recentEntries] = await Promise.all([
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
            pageCount: true,
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
  ]);

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
    work: e.work,
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
                {reads.map((uw) => (
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
                    <ReadingProgressWidget
                      workId={uw.work.id}
                      currentPage={uw.currentPage}
                      currentPercent={uw.progressPercent}
                      pageCount={uw.work.pageCount}
                    />
                  </Card>
                ))}
              </div>
            )}
            {watching.length > 0 && (
              <WorkGrid works={watching.map((uw) => uw.work)} />
            )}
          </div>
        )}
      </section>

      {/* Dernières entrées du journal (S13) */}
      {entries.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Dernières entrées
            </h2>
            <Link href="/journal" className="text-sm text-accent hover:underline">
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
          <WorkGrid works={recent} />
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
