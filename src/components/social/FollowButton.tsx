"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { followUser, unfollowUser } from "@/actions/follow";
import { Button } from "@/components/ui/Button";

export type FollowState =
  | "none"
  | "pending"
  | "accepted"
  | "self"
  | "anonymous";

/**
 * S'abonner à un membre (P2).
 *
 * Un visiteur déconnecté voit une invite à se connecter plutôt qu'un bouton
 * inerte : le geste reste possible, il demande juste un compte d'abord.
 */
export function FollowButton({
  targetUserId,
  initial,
}: {
  targetUserId: string;
  initial: FollowState;
}) {
  const [state, setState] = useState<FollowState>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Le serveur reste la source de vérité : on réaligne l'état pendant le rendu
  // plutôt que par un effet (règle react-hooks/set-state-in-effect).
  const [last, setLast] = useState(initial);
  if (initial !== last) {
    setLast(initial);
    setState(initial);
  }

  if (state === "self") return null;

  if (state === "anonymous") {
    return (
      <Link href="/connexion">
        <Button variant="secondary" size="sm">
          Se connecter pour suivre
        </Button>
      </Link>
    );
  }

  const following = state === "accepted" || state === "pending";

  function act() {
    setError(null);
    const previous = state;
    start(async () => {
      const res = following
        ? await unfollowUser(targetUserId)
        : await followUser(targetUserId);
      if ("error" in res) {
        setState(previous);
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant={following ? "secondary" : "primary"}
        size="sm"
        disabled={pending}
        aria-pressed={following}
        onClick={act}
      >
        {state === "pending"
          ? "Demande envoyée"
          : state === "accepted"
            ? "Se désabonner"
            : "Suivre"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
