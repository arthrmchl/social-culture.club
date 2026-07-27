import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/dates";
import { formatYear } from "@/lib/media";

export default async function RapportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const batch = await db.importBatch.findUnique({
    where: { id },
    select: {
      id: true,
      label: true,
      source: true,
      status: true,
      userId: true,
      appliedAt: true,
      stats: true,
    },
  });
  if (!batch || batch.userId !== user.id) notFound();

  const stats = (batch.stats ?? {}) as {
    applied?: number;
    created?: number;
    entries?: number;
    failed?: number;
    ignored?: number;
  };

  const [withExtra, failures, createdWorks, toComplete] = await Promise.all([
    // Ce qui a été volontairement conservé plutôt qu'écrasé.
    db.importTarget.findMany({
      where: { batchId: batch.id, appliedAt: { not: null } },
      select: { id: true, titleFr: true, extra: true },
      orderBy: { titleNormalized: "asc" },
      take: 200,
    }),
    // Les vrais échecs, eux, portent un message d'erreur.
    db.importTarget.findMany({
      where: { batchId: batch.id, error: { not: null } },
      select: { id: true, titleFr: true, error: true },
      orderBy: { titleNormalized: "asc" },
      take: 50,
    }),
    db.importTarget.findMany({
      where: { batchId: batch.id, resolution: "CREATE", appliedAt: { not: null } },
      select: { id: true, titleFr: true, year: true },
      orderBy: { titleNormalized: "asc" },
      take: 12,
    }),
    db.work.count({ where: { needsCompletion: true } }),
  ]);

  const conserved = withExtra
    .map((t) => ({
      id: t.id,
      titleFr: t.titleFr,
      conflicts: ((t.extra ?? {}) as { conflicts?: string[] }).conflicts ?? [],
    }))
    .filter((t) => t.conflicts.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/import/${batch.id}`}
          className="text-sm text-muted hover:text-foreground"
        >
          ← {batch.label ?? batch.source}
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Import terminé</h1>
        {batch.appliedAt && (
          <p className="text-sm text-muted">
            Appliqué le {formatDate(batch.appliedAt)}
          </p>
        )}
      </div>

      <Card>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Œuvres traitées" value={stats.applied ?? 0} />
          <Stat label="Fiches créées" value={stats.created ?? 0} />
          <Stat label="Entrées de journal" value={stats.entries ?? 0} />
          <Stat label="Ignorées" value={stats.ignored ?? 0} />
        </dl>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link href="/journal">
          <Button>Voir mon journal</Button>
        </Link>
        {toComplete > 0 && (
          <Link href="/a-completer">
            <Button variant="secondary">
              Compléter {toComplete} fiche{toComplete > 1 ? "s" : ""}
            </Button>
          </Link>
        )}
        <Link href="/import">
          <Button variant="ghost">Nouvel import</Button>
        </Link>
      </div>

      {conserved.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Données existantes conservées
          </h2>
          <p className="mb-2 text-sm text-muted">
            L&apos;import n&apos;écrase jamais ce que vous aviez déjà saisi.
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {conserved.map((t) => (
              <li key={t.id}>
                <span className="font-medium">{t.titleFr}</span> —{" "}
                {t.conflicts.join(", ")}
              </li>
            ))}
          </ul>
        </section>
      )}

      {failures.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Œuvres en échec
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {failures.map((t) => (
              <li key={t.id} className="text-danger">
                <span className="font-medium">{t.titleFr}</span> — {t.error}
              </li>
            ))}
          </ul>
        </section>
      )}

      {createdWorks.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Quelques fiches créées
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {createdWorks.map((t) => (
              <li key={t.id} className="text-muted">
                {t.titleFr}{" "}
                <span className="text-xs">({formatYear(t.year)})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Card className="text-sm text-muted">
        Ce lot reste consultable : réimporter le même export ne créera aucun
        doublon, chaque entrée portant une clé stable.
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-2xl font-semibold">{value}</dd>
    </div>
  );
}
