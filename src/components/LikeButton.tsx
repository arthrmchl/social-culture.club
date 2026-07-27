"use client";

import { useState, useTransition } from "react";
import { toggleLike } from "@/actions/status";
import { cn } from "@/lib/utils";

/** Cœur « j'aime », indépendant de la note (S6). */
export function LikeButton({
  workId,
  liked,
}: {
  workId: string;
  liked: boolean;
}) {
  const [on, setOn] = useState(liked);
  const [pending, start] = useTransition();

  const [lastLiked, setLastLiked] = useState(liked);
  if (liked !== lastLiked) {
    setLastLiked(liked);
    setOn(liked);
  }

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={on}
      onClick={() => {
        const prev = on;
        setOn(!on);
        start(async () => {
          const res = await toggleLike(workId);
          if ("error" in res) setOn(prev);
        });
      }}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-[var(--radius)] border px-3 text-sm transition-colors",
        on
          ? "border-danger text-danger"
          : "border-border text-muted hover:text-foreground",
      )}
    >
      <span className="text-lg leading-none">{on ? "♥" : "♡"}</span>
      J'aime
    </button>
  );
}
