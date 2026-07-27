"use client";

import { useState, useTransition } from "react";
import { setRating } from "@/actions/status";
import { setSeasonRating } from "@/actions/season";
import { scoreToStars } from "@/lib/rating";
import { StarInput } from "./StarInput";

export type RatingTarget =
  { kind: "work"; id: string } | { kind: "season"; id: string };

async function rate(target: RatingTarget, stars: number | null) {
  return target.kind === "work"
    ? setRating(target.id, stars)
    : setSeasonRating(target.id, stars);
}

/** Saisie de la note (S5) reliée au serveur — pour une œuvre ou une saison. */
export function RatingStars({
  target,
  score,
  size,
}: {
  target: RatingTarget;
  score: number | null;
  size?: string;
}) {
  const [value, setValue] = useState<number | null>(
    score != null ? scoreToStars(score) : null,
  );
  const [pending, start] = useTransition();

  // Reflète une note recalculée/rafraîchie côté serveur (ajustement au rendu).
  const [lastScore, setLastScore] = useState(score);
  if (score !== lastScore) {
    setLastScore(score);
    setValue(score != null ? scoreToStars(score) : null);
  }

  return (
    <StarInput
      value={value}
      disabled={pending}
      size={size}
      onChange={(next) => {
        const prev = value;
        setValue(next);
        start(async () => {
          const res = await rate(target, next);
          if ("error" in res) setValue(prev);
        });
      }}
    />
  );
}
