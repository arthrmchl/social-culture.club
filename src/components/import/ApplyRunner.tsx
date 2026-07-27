"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { applyImportChunk } from "@/actions/import";
import type { ImportBatchStatus } from "@/generated/prisma/enums";

/**
 * Application par paquets (I6) : le client rappelle l'action jusqu'à
 * épuisement. Aucun appel long, donc aucun risque de délai dépassé, et une
 * interruption se reprend simplement — l'avancement vit en base.
 */
export function ApplyRunner({
  batchId,
  total,
  status,
}: {
  batchId: string;
  total: number;
  status: ImportBatchStatus;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(status === "APPLIED");
  const [processed, setProcessed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    let count = 0;

    // Garde-fou : jamais plus de paquets qu'il n'y a de cibles.
    const maxRounds = Math.ceil(total / 25) + 2;

    for (let round = 0; round < maxRounds; round += 1) {
      const res = await applyImportChunk(batchId);
      if ("error" in res) {
        setError(res.error);
        setRunning(false);
        return;
      }
      count += res.processed;
      setProcessed(count);
      if (res.done) {
        setDone(true);
        setRunning(false);
        router.push(`/import/${batchId}/rapport`);
        return;
      }
      if (res.processed === 0) break; // plus rien à faire
    }

    setRunning(false);
    router.refresh();
  }

  if (done) {
    return (
      <Button variant="secondary" onClick={() => router.push(`/import/${batchId}/rapport`)}>
        Voir le rapport
      </Button>
    );
  }

  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

  return (
    <div className="flex flex-col gap-2">
      {running && (
        <div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-elevated"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-accent transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted">
            {processed} / {total} œuvres appliquées…
          </p>
        </div>
      )}

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div>
        <Button onClick={run} disabled={running || total === 0}>
          {running
            ? "Application…"
            : status === "APPLYING"
              ? "Reprendre l'application"
              : "Appliquer l'import"}
        </Button>
      </div>
    </div>
  );
}
