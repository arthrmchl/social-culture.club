"use client";

import { useState, useTransition } from "react";
import { toggleSocialLike } from "@/actions/social-like";
import type { SocialTarget } from "@/lib/social-target";

/**
 * Le j'aime **social** (P3) — sur une entrée, une liste ou une critique.
 *
 * À ne pas confondre avec `LikeButton` (`src/components/LikeButton.tsx`), qui
 * bascule `UserWork.liked` : le j'aime personnel sur une œuvre (S6). Deux
 * composants, deux libellés, deux compteurs — jamais mélangés. Le nom du
 * fichier est le premier rappel de cette distinction.
 */
export function SocialLikeButton({
  target,
  initialCount,
  initialLiked,
  canInteract,
}: {
  target: SocialTarget;
  initialCount: number;
  initialLiked: boolean;
  canInteract: boolean;
}) {
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(initialLiked);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Réalignement sur le serveur pendant le rendu, pas via un effet.
  const [last, setLast] = useState({ initialCount, initialLiked });
  if (last.initialCount !== initialCount || last.initialLiked !== initialLiked) {
    setLast({ initialCount, initialLiked });
    setCount(initialCount);
    setLiked(initialLiked);
  }

  if (!canInteract) {
    return (
      <span className="text-xs text-muted" title="J'aime">
        ♥ {count}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={pending}
        aria-pressed={liked}
        aria-label={liked ? "Retirer mon j'aime" : "J'aime"}
        className={
          liked
            ? "rounded-full border border-accent px-2 py-0.5 text-xs text-accent"
            : "rounded-full border border-border px-2 py-0.5 text-xs text-muted hover:bg-elevated"
        }
        onClick={() => {
          setError(null);
          start(async () => {
            const res = await toggleSocialLike(target);
            if ("error" in res) {
              setError(res.error);
              return;
            }
            // Le serveur recompte dans sa transaction : on prend son chiffre
            // plutôt qu'un incrément local qui divergerait à deux onglets.
            setLiked(res.liked);
            setCount(res.count);
          });
        }}
      >
        ♥ {count}
      </button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
