"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { bulkResolve } from "@/actions/import";

/**
 * Actions groupées sur ce qui reste à décider (I6) — barre collante en bas
 * d'écran, pour ne pas obliger à parcourir des centaines de cartes.
 */
export function BulkBar({
  batchId,
  pendingCount,
}: {
  batchId: string;
  pendingCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (pendingCount === 0) return null;

  function run(resolution: "CREATE" | "IGNORE", question: string) {
    if (!confirm(question)) return;
    setError(null);
    startTransition(async () => {
      const res = await bulkResolve(batchId, "pending", resolution);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="sticky bottom-16 z-10 rounded-[var(--radius)] border border-border bg-surface/95 p-3 backdrop-blur sm:bottom-2">
      {error && (
        <p className="mb-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">{pendingCount} à décider</span>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              run(
                "CREATE",
                `Créer une fiche pour les ${pendingCount} œuvres encore à décider ?`,
              )
            }
          >
            Tout créer
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              run(
                "IGNORE",
                `Ignorer les ${pendingCount} œuvres encore à décider ? Leurs entrées ne seront pas importées.`,
              )
            }
          >
            Tout ignorer
          </Button>
        </div>
      </div>
    </div>
  );
}
