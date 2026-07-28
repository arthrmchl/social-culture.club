"use client";

import { useState, useTransition } from "react";
import { updateReadingProgress } from "@/actions/status";
import { Input } from "./ui/Field";
import { Button } from "./ui/Button";

/**
 * Mise à jour rapide de la progression de lecture (L2, N1).
 * Page si la pagination est connue, sinon pourcentage. Historisé côté serveur.
 *
 * `editionId` est **requis** : on ne suit une lecture qu'une fois désignée
 * l'édition lue (lot 5). Le typage oblige donc l'appelant à avoir tranché
 * avant de rendre ce composant.
 */
export function ReadingProgressWidget({
  workId,
  editionId,
  currentPage,
  currentPercent,
  pageCount,
}: {
  workId: string;
  editionId: string;
  currentPage: number | null;
  currentPercent: number | null;
  pageCount: number | null;
}) {
  const usePage = pageCount != null && pageCount > 0;
  const [val, setVal] = useState<string>(
    usePage
      ? currentPage != null
        ? String(currentPage)
        : ""
      : currentPercent != null
        ? String(currentPercent)
        : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const n = parseInt(val, 10);
  const percent = usePage
    ? Number.isFinite(n) && pageCount
      ? Math.min(100, Math.round((n / pageCount) * 100))
      : null
    : Number.isFinite(n)
      ? Math.min(100, Math.max(0, n))
      : null;

  function submit() {
    const value = parseInt(val, 10);
    if (!Number.isFinite(value) || value < 0) {
      setError("Valeur invalide.");
      return;
    }
    if (usePage && pageCount && value > pageCount) {
      setError(`Maximum ${pageCount} pages.`);
      return;
    }
    setError(null);
    start(async () => {
      const res = await updateReadingProgress(workId, {
        ...(usePage ? { page: value } : { percent: Math.min(100, value) }),
        editionId,
      });
      if ("error" in res) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="w-28">
          <label className="mb-1 block text-xs text-muted">
            {usePage ? "Page courante" : "Progression"}
          </label>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={usePage ? (pageCount ?? undefined) : 100}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </div>
        <span className="pb-2 text-sm text-muted">
          {usePage ? `/ ${pageCount}` : "%"}
        </span>
        <Button size="sm" disabled={pending} onClick={submit}>
          Mettre à jour
        </Button>
      </div>
      {percent != null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
