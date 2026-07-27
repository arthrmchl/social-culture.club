"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { replayRetainedFiles } from "@/actions/import";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/**
 * Reprise des fichiers mis de côté (S9) — les listes Letterboxd conservées
 * brutes au lot 2, faute de modèle pour les recevoir.
 *
 * Le geste crée un lot d'import neuf plutôt que de rejouer celui-ci : le lot
 * d'origine reste intact, et l'écran de rapprochement habituel s'occupe des
 * films que les listes citent sans que le journal les ait mentionnés.
 */
export function ReplayLists({
  batchId,
  count,
}: {
  batchId: string;
  count: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Card className="flex flex-col gap-3 border-accent/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium">
          {count} fichier{count > 1 ? "s" : ""} de listes en attente
        </p>
        <p className="text-sm text-muted">
          Conservé{count > 1 ? "s" : ""} tel{count > 1 ? "s" : ""} quel
          {count > 1 ? "s" : ""} lors de cet import. Les listes existent
          maintenant dans l&apos;application&nbsp;: vous pouvez les reprendre.
        </p>
        {error && (
          <p role="alert" className="mt-1 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await replayRetainedFiles(batchId);
            if ("error" in res) setError(res.error);
            else router.push(`/import/${res.batchId}`);
          })
        }
      >
        Reprendre les listes
      </Button>
    </Card>
  );
}
