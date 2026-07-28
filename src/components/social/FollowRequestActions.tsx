"use client";

import { useState, useTransition } from "react";
import {
  acceptFollowRequest,
  rejectFollowRequest,
  removeFollower,
  unfollowUser,
} from "@/actions/follow";
import { Button } from "@/components/ui/Button";

/** Accepter ou refuser une demande d'abonnement (compte privé, P5). */
export function FollowRequestActions({ followId }: { followId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: true } | { error: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if ("error" in res) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => run(() => acceptFollowRequest(followId))}
        >
          Accepter
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => rejectFollowRequest(followId))}
        >
          Refuser
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Retirer un abonné, ou se désabonner.
 *
 * Retirer un abonné est le pendant doux du blocage : on coupe le lien sans
 * fermer la porte. La confirmation évite le geste involontaire, sans plus.
 */
export function FollowLinkAction({
  userId,
  mode,
  name,
}: {
  userId: string;
  mode: "remove-follower" | "unfollow";
  name: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const label = mode === "remove-follower" ? "Retirer" : "Se désabonner";
  const question =
    mode === "remove-follower"
      ? `Retirer ${name} de vos abonnés ?`
      : `Ne plus suivre ${name} ?`;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (!confirm(question)) return;
          setError(null);
          start(async () => {
            const res =
              mode === "remove-follower"
                ? await removeFollower(userId)
                : await unfollowUser(userId);
            if ("error" in res) setError(res.error);
          });
        }}
      >
        {label}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
