import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Card, EmptyState } from "@/components/ui/Card";
import { ImportDropzone } from "@/components/import/ImportDropzone";
import { formatDate } from "@/lib/dates";
import type { ImportBatchStatus } from "@/generated/prisma/enums";

const STATUS_LABEL: Record<ImportBatchStatus, string> = {
  UPLOADED: "À analyser",
  ANALYZED: "Prêt à appliquer",
  APPLYING: "Application en cours",
  APPLIED: "Appliqué",
  FAILED: "En échec",
  CANCELLED: "Annulé",
};

export default async function ImportPage() {
  const user = await requireUser();

  const batches = await db.importBatch.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      label: true,
      source: true,
      status: true,
      createdAt: true,
      stats: true,
      _count: { select: { files: true, targets: true } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Importer mon historique</h1>
        <p className="mt-1 text-sm text-muted">
          Reprenez votre historique Letterboxd, Serializd ou de lectures. Les
          œuvres absentes du catalogue sont créées ; rien n&apos;est écrit avant
          votre validation, et réimporter le même fichier ne crée pas de doublon.
        </p>
      </div>

      <Card>
        <ImportDropzone />
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Mes imports
        </h2>

        {batches.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {batches.map((b) => {
              const stats = (b.stats ?? {}) as { events?: number };
              return (
                <li key={b.id}>
                  <Link
                    href={`/import/${b.id}`}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border px-3 py-2 hover:bg-elevated"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {b.label ?? b.source}
                      </span>
                      <span className="block text-xs text-muted">
                        {formatDate(b.createdAt)} · {b._count.files} fichier(s)
                        {b._count.targets > 0
                          ? ` · ${b._count.targets} œuvre(s)`
                          : ""}
                        {stats.events ? ` · ${stats.events} entrée(s)` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                      {STATUS_LABEL[b.status]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title="Aucun import pour l'instant"
            description="Déposez les CSV d'un de vos services pour commencer la reprise."
          />
        )}
      </section>
    </div>
  );
}
