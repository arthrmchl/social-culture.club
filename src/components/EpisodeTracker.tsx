"use client";

import { useState, useTransition } from "react";
import {
  setEpisodeWatched,
  markSeasonWatched,
  markUpTo,
} from "@/actions/progress";
import { RatingStars } from "./RatingStars";
import { ReviewEditor } from "./ReviewEditor";
import { Input } from "./ui/Field";
import { Button } from "./ui/Button";
import { cn } from "@/lib/utils";

export type EpisodeItem = {
  id: string;
  number: number;
  title: string | null;
  watched: boolean;
};

export type SeasonItem = {
  id: string;
  number: number;
  title: string | null;
  episodes: EpisodeItem[];
  rating: number | null;
  reviewText: string | null;
  reviewHasSpoiler: boolean;
};

/** Progression à l'épisode (T1), marquage de saison (T4), note/critique de saison (T3). */
export function EpisodeTracker({
  workId,
  seasons: initial,
}: {
  workId: string;
  seasons: SeasonItem[];
}) {
  const [seasons, setSeasons] = useState(initial);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function patchEpisode(epId: string, watched: boolean) {
    setSeasons((prev) =>
      prev.map((s) => ({
        ...s,
        episodes: s.episodes.map((e) =>
          e.id === epId ? { ...e, watched } : e,
        ),
      })),
    );
  }

  function toggleEpisode(ep: EpisodeItem) {
    const next = !ep.watched;
    patchEpisode(ep.id, next);
    start(async () => {
      const res = await setEpisodeWatched(ep.id, next);
      if ("error" in res) setSeasons(initial);
    });
  }

  function toggleSeason(season: SeasonItem) {
    const allWatched =
      season.episodes.length > 0 && season.episodes.every((e) => e.watched);
    const next = !allWatched;
    setSeasons((prev) =>
      prev.map((s) =>
        s.id === season.id
          ? { ...s, episodes: s.episodes.map((e) => ({ ...e, watched: next })) }
          : s,
      ),
    );
    start(async () => {
      const res = await markSeasonWatched(season.id, next);
      if ("error" in res) setSeasons(initial);
    });
  }

  function submitUpTo() {
    if (!code.trim()) return;
    setError(null);
    start(async () => {
      const res = await markUpTo(workId, code);
      if ("error" in res) setError(res.error);
      else setCode("");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Vu jusqu'à SxxEyy (T1) */}
      <div className="flex items-end gap-2">
        <div className="w-32">
          <label className="mb-1 block text-xs text-muted">Vu jusqu'à</label>
          <Input
            value={code}
            placeholder="S02E05"
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitUpTo();
            }}
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={submitUpTo}
        >
          Marquer
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}

      {seasons.map((season) => {
        const watched = season.episodes.filter((e) => e.watched).length;
        const allWatched =
          season.episodes.length > 0 && watched === season.episodes.length;
        return (
          <details
            key={season.id}
            className="rounded-[var(--radius)] border border-border"
          >
            <summary className="flex cursor-pointer select-none items-center justify-between gap-2 p-3 text-sm">
              <span className="font-medium">
                Saison {season.number}
                {season.title ? ` — ${season.title}` : ""}
              </span>
              <span className="text-xs text-muted">
                {watched}/{season.episodes.length} vus
              </span>
            </summary>

            <div className="flex flex-col gap-3 border-t border-border p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allWatched}
                  disabled={pending || season.episodes.length === 0}
                  onChange={() => toggleSeason(season)}
                />
                Toute la saison vue
              </label>

              <div className="flex flex-col gap-1">
                {season.episodes.map((ep) => (
                  <label
                    key={ep.id}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-elevated",
                      ep.watched && "text-muted",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={ep.watched}
                      disabled={pending}
                      onChange={() => toggleEpisode(ep)}
                    />
                    <span>
                      É{ep.number}
                      {ep.title ? ` · ${ep.title}` : ""}
                    </span>
                  </label>
                ))}
              </div>

              {/* Note et critique de saison (T3) */}
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <span className="text-xs uppercase tracking-wide text-muted">
                  Note de la saison
                </span>
                <RatingStars
                  target={{ kind: "season", id: season.id }}
                  score={season.rating}
                  size="text-xl"
                />
                <ReviewEditor
                  target={{ kind: "season", id: season.id }}
                  text={season.reviewText}
                  hasSpoiler={season.reviewHasSpoiler}
                  label="Critique de la saison"
                />
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}
