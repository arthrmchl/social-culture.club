"use client";

import { useState, useTransition } from "react";
import { blockUser, unblockUser } from "@/actions/block";
import { Button } from "@/components/ui/Button";

/**
 * Bloquer ou débloquer un membre (D25, P4).
 *
 * La confirmation dit ce que le geste fait vraiment : le blocage est
 * réciproque, et il coupe les abonnements dans les deux sens. Ce n'est pas un
 * détail d'implémentation, c'est l'essentiel de ce que l'utilisateur choisit.
 */
export function BlockButton({
  targetUserId,
  name,
  blocked,
}: {
  targetUserId: string;
  name: string;
  blocked: boolean;
}) {
  const [on, setOn] = useState(blocked);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [last, setLast] = useState(blocked);
  if (blocked !== last) {
    setLast(blocked);
    setOn(blocked);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={on ? "secondary" : "ghost"}
        disabled={pending}
        aria-pressed={on}
        onClick={() => {
          if (
            !on &&
            !confirm(
              `Bloquer ${name} ? Vous ne verrez plus son contenu et il ne verra plus le vôtre. Vos abonnements réciproques seront supprimés.`,
            )
          ) {
            return;
          }
          setError(null);
          const previous = on;
          start(async () => {
            const res = on
              ? await unblockUser(targetUserId)
              : await blockUser(targetUserId);
            if ("error" in res) {
              setOn(previous);
              setError(res.error);
            } else {
              setOn(!previous);
            }
          });
        }}
      >
        {on ? "Débloquer" : "Bloquer"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
