import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { BatchActions } from "@/components/import/BatchActions";
import { formatDate } from "@/lib/dates";
import { formatBytes } from "@/lib/import/limits";
import {
  DEFAULT_IMPORT_OPTIONS,
  type ImportOptions,
  type ImportWarning,
} from "@/lib/import/types";

const LEVEL_STYLE: Record<ImportWarning["level"], string> = {
  info: "border-border text-muted",
  warning: "border-accent/50",
  error: "border-danger/60 text-danger",
};

export default async function ImportBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const batch = await db.importBatch.findUnique({
    where: { id },
    include: {
      files: { orderBy: { name: "asc" } },
      _count: { select: { targets: true, rows: true } },
    },
  });
  if (!batch || batch.userId !== user.id) notFound();

  const options: ImportOptions = {
    ...DEFAULT_IMPORT_OPTIONS,
    ...(batch.options as Partial<ImportOptions>),
  };
  const warnings = (batch.warnings ?? []) as ImportWarning[];
  const stats = (batch.stats ?? {}) as {
    events?: number;
    targets?: number;
    autoLink?: number;
    autoCreate?: number;
    pending?: number;
  };

  const analyzed = batch.status === "ANALYZED";
  const locked = batch.status === "APPLYING" || batch.status === "APPLIED";

  const pendingCount = await db.importTarget.count({
    where: { batchId: batch.id, decidedBy: null },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/import"
          className="text-sm text-muted hover:text-foreground"
        >
          ← Mes imports
        </Link>
        <h1 className="mt-1 text-xl font-semibold">
          {batch.label ?? batch.source}
        </h1>
        <p className="text-sm text-muted">
          Déposé le {formatDate(batch.createdAt)} · {batch.files.length}{" "}
          fichier(s)
          {batch.analyzedAt
            ? ` · analysé le ${formatDate(batch.analyzedAt)}`
            : ""}
        </p>
      </div>

      {/* Récapitulatif */}
      {analyzed || locked ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Ce que contient ce lot</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Œuvres" value={batch._count.targets} />
            <Stat label="Événements" value={batch._count.rows} />
            <Stat label="Rattachements" value={stats.autoLink ?? 0} />
            <Stat label="Créations" value={stats.autoCreate ?? 0} />
          </dl>

          {pendingCount > 0 ? (
            <p className="text-sm">
              <strong>{pendingCount}</strong> œuvre(s) demandent votre avis
              avant l&apos;application.
            </p>
          ) : (
            <p className="text-sm text-muted">
              Tout a pu être décidé automatiquement — vous pouvez vérifier puis
              appliquer.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Link href={`/import/${batch.id}/rapprochement`}>
              <Button>
                {pendingCount > 0
                  ? `Rapprocher (${pendingCount})`
                  : "Vérifier le rapprochement"}
              </Button>
            </Link>
            {batch.status === "APPLIED" && (
              <Link href={`/import/${batch.id}/rapport`}>
                <Button variant="secondary">Voir le rapport</Button>
              </Link>
            )}
          </div>
        </Card>
      ) : (
        <Card className="text-sm text-muted">
          Ce lot n&apos;a pas encore été analysé. Vérifiez les options
          ci-dessous, puis lancez l&apos;analyse — elle ne modifie rien dans
          votre suivi.
        </Card>
      )}

      {/* Avertissements */}
      {warnings.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Points d&apos;attention
          </h2>
          <ul className="flex flex-col gap-2">
            {warnings.map((w, i) => (
              <li
                key={`${w.file}-${i}`}
                className={`rounded-[var(--radius)] border px-3 py-2 text-sm ${LEVEL_STYLE[w.level]}`}
              >
                <span className="font-medium">{w.file}</span>
                {w.line ? ` (ligne ${w.line})` : ""} — {w.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <BatchActions
        batchId={batch.id}
        source={batch.source}
        options={options}
        analyzed={analyzed}
        locked={locked}
      />

      {/* Fichiers */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Fichiers déposés
        </h2>
        <ul className="flex flex-col gap-1 text-sm">
          {batch.files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 text-xs text-muted">
                {formatBytes(f.bytes)}
                {f.parsed ? "" : " · conservé pour plus tard"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
