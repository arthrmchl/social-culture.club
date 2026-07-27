"use client";

import { useState, useTransition } from "react";
import { toggleFavorite } from "@/actions/favorite";
import { MAX_FAVORITES } from "@/lib/favorites";
import { cn } from "@/lib/utils";

/**
 * Favori de profil (S11) — distinct du « j'aime » (S6), qui reste une réaction
 * à l'œuvre. Un favori, c'est ce qu'on met en vitrine ; d'où le plafond.
 */
export function FavoriteButton({
  workId,
  isFavorite,
}: {
  workId: string;
  isFavorite: boolean;
}) {
  const [value, setValue] = useState(isFavorite);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [last, setLast] = useState(isFavorite);
  if (isFavorite !== last) {
    setLast(isFavorite);
    setValue(isFavorite);
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        aria-pressed={value}
        title={`Favori de profil (${MAX_FAVORITES} au maximum)`}
        onClick={() => {
          const prev = value;
          setValue(!prev);
          setError(null);
          start(async () => {
            const res = await toggleFavorite(workId);
            if ("error" in res) {
              setValue(prev);
              setError(res.error);
            }
          });
        }}
        className={cn(
          "flex items-center gap-1.5 rounded-[var(--radius)] border px-3 py-1.5 text-sm transition-colors disabled:opacity-50",
          value
            ? "border-accent text-accent"
            : "border-border text-muted hover:bg-elevated",
        )}
      >
        <span aria-hidden>{value ? "★" : "☆"}</span>
        {value ? "Favori" : "Favori"}
      </button>

      {error && (
        <p role="alert" className="max-w-56 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
