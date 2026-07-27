import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Card, EmptyState } from "@/components/ui/Card";
import { TargetCard, type TargetCardData } from "@/components/import/TargetCard";
import { BulkBar } from "@/components/import/BulkBar";
import { ApplyRunner } from "@/components/import/ApplyRunner";
import type { ImportCandidate } from "@/lib/import/match";
import type { Prisma } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

type Filtre = "a-decider" | "rattachees" | "a-creer" | "ignorees";

/** Chaque onglet ne montre qu'un état : on ne noie pas l'ambigu dans l'évident. */
const FILTERS: Record<Filtre, { label: string; where: Prisma.ImportTargetWhereInput }> = {
  "a-decider": { label: "À décider", where: { decidedBy: null } },
  rattachees: {
    label: "Rattachées",
    where: { resolution: "LINK", decidedBy: { not: null } },
  },
  "a-creer": {
    label: "À créer",
    where: { resolution: "CREATE", decidedBy: { not: null } },
  },
  ignorees: {
    label: "Ignorées",
    where: { resolution: "IGNORE", decidedBy: { not: null } },
  },
};

export default async function RapprochementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filtre?: string; page?: string }>;
}) {
  const { id } = await params;
  const { filtre, page } = await searchParams;
  const user = await requireUser();

  const batch = await db.importBatch.findUnique({
    where: { id },
    select: { id: true, label: true, source: true, status: true, userId: true },
  });
  if (!batch || batch.userId !== user.id) notFound();

  const current: Filtre =
    filtre && filtre in FILTERS ? (filtre as Filtre) : "a-decider";
  const pageNum = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);

  const counts = await Promise.all(
    (Object.keys(FILTERS) as Filtre[]).map(async (key) => ({
      key,
      count: await db.importTarget.count({
        where: { batchId: batch.id, ...FILTERS[key].where },
      }),
    })),
  );
  const countOf = (k: Filtre) => counts.find((c) => c.key === k)?.count ?? 0;

  const total = countOf(current);
  const targets = await db.importTarget.findMany({
    where: { batchId: batch.id, ...FILTERS[current].where },
    orderBy: { titleNormalized: "asc" },
    skip: (pageNum - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: { _count: { select: { rows: true } } },
  });

  const pendingCount = countOf("a-decider");
  const applicable = countOf("rattachees") + countOf("a-creer");
  const editable = batch.status !== "APPLYING" && batch.status !== "APPLIED";

  const cards: TargetCardData[] = targets.map((t) => {
    const extra = (t.extra ?? {}) as { seasons?: number[]; volumes?: number[] };
    return {
      id: t.id,
      titleFr: t.titleFr,
      year: t.year,
      type: t.type,
      summary: summarize(t._count.rows, extra),
      resolution: t.resolution,
      decided: t.decidedBy !== null,
      confidence: t.confidence,
      matchedWorkId: t.matchedWorkId,
      candidates: (t.candidates ?? []) as ImportCandidate[],
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href={`/import/${batch.id}`}
          className="text-sm text-muted hover:text-foreground"
        >
          ← {batch.label ?? batch.source}
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Rapprochement</h1>
        <p className="text-sm text-muted">
          Pour chaque œuvre : la rattacher à une fiche existante, en créer une,
          ou l&apos;ignorer. Une décision par œuvre, pas par ligne.
        </p>
      </div>

      {/* Onglets */}
      <div className="flex flex-wrap gap-2 text-sm">
        {(Object.keys(FILTERS) as Filtre[]).map((key) => (
          <Link
            key={key}
            href={`/import/${batch.id}/rapprochement?filtre=${key}`}
            className={cn(
              "rounded-full border px-3 py-1",
              key === current
                ? "border-accent text-accent"
                : "border-border text-muted hover:bg-elevated",
            )}
          >
            {FILTERS[key].label} ({countOf(key)})
          </Link>
        ))}
      </div>

      {cards.length > 0 ? (
        <div className="flex flex-col gap-3">
          {cards.map((t) => (
            <TargetCard key={t.id} target={t} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            current === "a-decider"
              ? "Rien à décider"
              : "Aucune œuvre dans cet onglet"
          }
          description={
            current === "a-decider"
              ? "L'analyse a tout tranché toute seule. Vérifiez les autres onglets, puis appliquez."
              : undefined
          }
        />
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <nav className="flex items-center justify-between text-sm">
          <PageLink
            batchId={batch.id}
            filtre={current}
            page={pageNum - 1}
            disabled={pageNum <= 1}
          >
            ← Précédent
          </PageLink>
          <span className="text-muted">
            {(pageNum - 1) * PAGE_SIZE + 1}–
            {Math.min(pageNum * PAGE_SIZE, total)} sur {total}
          </span>
          <PageLink
            batchId={batch.id}
            filtre={current}
            page={pageNum + 1}
            disabled={pageNum * PAGE_SIZE >= total}
          >
            Suivant →
          </PageLink>
        </nav>
      )}

      {editable && <BulkBar batchId={batch.id} pendingCount={pendingCount} />}

      {/* Application */}
      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold">Appliquer l&apos;import</h2>
          <p className="text-xs text-muted">
            {applicable} œuvre(s) seront rattachées ou créées, avec leurs entrées
            de journal. Réappliquer le même lot ne crée pas de doublon.
          </p>
        </div>
        {pendingCount > 0 && (
          <p className="text-sm text-muted">
            {pendingCount} œuvre(s) restent à décider : elles seront ignorées si
            vous appliquez maintenant.
          </p>
        )}
        <ApplyRunner
          batchId={batch.id}
          total={applicable}
          status={batch.status}
        />
      </Card>
    </div>
  );
}

function PageLink({
  batchId,
  filtre,
  page,
  disabled,
  children,
}: {
  batchId: string;
  filtre: string;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) return <span className="text-muted opacity-50">{children}</span>;
  return (
    <Link
      href={`/import/${batchId}/rapprochement?filtre=${filtre}&page=${page}`}
      className="text-accent hover:underline"
    >
      {children}
    </Link>
  );
}

function summarize(
  rows: number,
  extra: { seasons?: number[]; volumes?: number[] },
): string {
  const parts: string[] = [rows === 1 ? "1 événement" : `${rows} événements`];
  const seasons = extra.seasons?.length ?? 0;
  const volumes = extra.volumes?.length ?? 0;
  if (seasons > 0) parts.push(seasons === 1 ? "1 saison" : `${seasons} saisons`);
  if (volumes > 0) parts.push(volumes === 1 ? "1 tome" : `${volumes} tomes`);
  return parts.join(" · ");
}
