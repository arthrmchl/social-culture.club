"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setFavorites } from "@/actions/favorite";
import { searchForPicker, type PickerResult } from "@/actions/search";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { CoverPlaceholder } from "@/components/CoverPlaceholder";
import { MAX_FAVORITES } from "@/lib/favorites";
import { MEDIA, formatYears } from "@/lib/media";
import type { WorkType } from "@/generated/prisma/enums";

export type FavoriteWork = {
  id: string;
  titleFr: string;
  type: WorkType;
  year: number | null;
  endYear: number | null;
  coverImageId: string | null;
};

/**
 * Les quatre œuvres en tête de profil (S11).
 *
 * L'ordre est celui de la rangée : l'utilisateur retire et rajoute plutôt que
 * de manipuler des positions, ce qui tient à quatre éléments et évite un
 * glisser-déposer inutilisable au doigt.
 */
export function FavoritesRow({ initial }: { initial: FavoriteWork[] }) {
  const [works, setWorks] = useState(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerResult[]>([]);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [last, setLast] = useState(initial);
  if (initial !== last) {
    setLast(initial);
    setWorks(initial);
  }

  function save(next: FavoriteWork[]) {
    const previous = works;
    setWorks(next);
    setError(null);
    start(async () => {
      const res = await setFavorites(next.map((w) => w.id));
      if ("error" in res) {
        setWorks(previous);
        setError(res.error);
      }
    });
  }

  function search(next: string) {
    setQuery(next);
    if (next.trim().length < 2) {
      setResults([]);
      return;
    }
    start(async () => setResults(await searchForPicker(next)));
  }

  const full = works.length >= MAX_FAVORITES;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-2">
        {works.map((w, index) => {
          const cover = w.coverImageId
            ? `/api/uploads/${w.coverImageId}`
            : null;
          return (
            <div key={w.id} className="flex flex-col gap-1">
              <Link
                href={`/oeuvre/${w.id}`}
                className="block aspect-[2/3] overflow-hidden rounded-[var(--radius)] border border-border bg-elevated"
                title={w.titleFr}
              >
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cover}
                    alt={`Visuel de ${w.titleFr}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <CoverPlaceholder title={w.titleFr} type={w.type} />
                )}
              </Link>
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-[11px] text-muted">
                  {w.titleFr}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`Retirer ${w.titleFr} des favoris`}
                  onClick={() => save(works.filter((_, i) => i !== index))}
                  className="shrink-0 text-xs text-muted hover:text-danger"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}

        {Array.from({ length: MAX_FAVORITES - works.length }).map((_, i) => (
          <div
            key={`vide-${i}`}
            className="flex aspect-[2/3] items-center justify-center rounded-[var(--radius)] border border-dashed border-border text-xs text-muted"
            aria-hidden
          >
            ☆
          </div>
        ))}
      </div>

      {!full && (
        <Card className="flex flex-col gap-2 p-3">
          <Input
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Chercher une œuvre à mettre en avant…"
            aria-label="Chercher une œuvre favorite"
          />
          {results.length > 0 && (
            <ul className="flex flex-col divide-y divide-border">
              {results
                .filter((r) => !works.some((w) => w.id === r.id))
                .map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm">
                      {MEDIA[r.type].emoji} {r.titleFr}{" "}
                      <span className="text-muted">({formatYears(r)})</span>
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => {
                        save([
                          ...works,
                          {
                            id: r.id,
                            titleFr: r.titleFr,
                            type: r.type,
                            year: r.year,
                            endYear: r.endYear,
                            coverImageId: r.coverImageId,
                          },
                        ]);
                        setQuery("");
                        setResults([]);
                      }}
                    >
                      Ajouter
                    </Button>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
