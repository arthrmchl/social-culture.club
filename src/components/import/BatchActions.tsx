"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Label, Select } from "@/components/ui/Field";
import { Card } from "@/components/ui/Card";
import {
  analyzeImportBatch,
  cancelImportBatch,
  deleteImportBatch,
} from "@/actions/import";
import type { ImportOptions } from "@/lib/import/types";
import type { ImportSource } from "@/generated/prisma/enums";

/** Cases à cocher d'analyse + relance, sur la page d'un lot (lot 2). */
export function BatchActions({
  batchId,
  source,
  options,
  analyzed,
  locked,
}: {
  batchId: string;
  source: ImportSource;
  options: ImportOptions;
  analyzed: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ImportOptions>(options);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isLetterboxd = source === "LETTERBOXD";
  const isSeries = source === "SERIALIZD";
  const isReading = source === "GOODREADS";

  function run(action: () => Promise<{ ok: true } | { error: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }

  const toggle = (key: keyof ImportOptions) => (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={Boolean(draft[key])}
        disabled={locked}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.checked }))}
        className="size-4 accent-[var(--color-accent)]"
      />
      {OPTION_LABELS[key]}
    </label>
  );

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold">Options d&apos;analyse</h2>
        <p className="text-xs text-muted">
          Modifier une option relance l&apos;analyse ; rien n&apos;est écrit
          dans votre suivi avant l&apos;application.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {isLetterboxd && toggle("importWatchlist")}
        {isLetterboxd && toggle("importLikes")}
        {toggle("importReviews")}
        {isLetterboxd && toggle("retainLists")}
        {isReading && toggle("detectVolumes")}

        {isLetterboxd && (
          <div className="mt-1">
            <Label htmlFor="fallback">Films vus sans date de visionnage</Label>
            <Select
              id="fallback"
              value={draft.watchedDateFallback}
              disabled={locked}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  watchedDateFallback: e.target
                    .value as ImportOptions["watchedDateFallback"],
                }))
              }
            >
              <option value="unknown">Entrée sans date</option>
              <option value="addedDate">Dater avec la date d&apos;ajout</option>
            </Select>
          </div>
        )}

        {isSeries && (
          <div className="mt-1">
            <Label htmlFor="seriesType">Type des séries importées</Label>
            <Select
              id="seriesType"
              value={draft.seriesDefaultType}
              disabled={locked}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  seriesDefaultType: e.target
                    .value as ImportOptions["seriesDefaultType"],
                }))
              }
            >
              <option value="SERIES">Série</option>
              <option value="ANIME">Animé</option>
            </Select>
            <p className="mt-1 text-xs text-muted">
              Modifiable ensuite œuvre par œuvre au rapprochement.
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending || locked}
          onClick={() => run(() => analyzeImportBatch(batchId, draft))}
        >
          {pending ? "…" : analyzed ? "Relancer l'analyse" : "Analyser"}
        </Button>
        {!locked && (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => cancelImportBatch(batchId))}
          >
            Abandonner
          </Button>
        )}
        <Button
          variant="danger"
          disabled={pending}
          onClick={() => {
            if (
              !confirm(
                "Supprimer ce lot d'import ? Les œuvres déjà créées sont conservées.",
              )
            )
              return;
            startTransition(async () => {
              const res = await deleteImportBatch(batchId);
              if ("error" in res) setError(res.error);
              else router.push("/import");
            });
          }}
        >
          Supprimer
        </Button>
      </div>
    </Card>
  );
}

const OPTION_LABELS: Record<keyof ImportOptions, string> = {
  watchedDateFallback: "Date de repli",
  importWatchlist: "Importer la liste d'envies",
  importLikes: "Importer les j'aime",
  importReviews: "Importer les critiques",
  detectVolumes: "Détecter les tomes dans les titres (« Vol. 3 »)",
  seriesDefaultType: "Type par défaut",
  retainLists: "Conserver les listes pour plus tard",
};
