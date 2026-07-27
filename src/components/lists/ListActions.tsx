"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteList, togglePinList } from "@/actions/list";
import { Button } from "@/components/ui/Button";

/** Épingler, modifier, supprimer — les commandes d'une liste (S9). */
export function ListActions({
  listId,
  title,
  slug,
  isPinned,
}: {
  listId: string;
  title: string;
  slug: string;
  isPinned: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        aria-pressed={isPinned}
        onClick={() =>
          start(async () => {
            const res = await togglePinList(listId);
            if ("error" in res) setError(res.error);
          })
        }
      >
        {isPinned ? "📌 Épinglée" : "📌 Épingler"}
      </Button>

      <Link href={`/listes/${slug}/modifier`}>
        <Button variant="secondary" size="sm">
          Modifier
        </Button>
      </Link>

      <Button
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (
            !confirm(
              `Supprimer la liste « ${title} » ? Les œuvres restent au catalogue.`,
            )
          ) {
            return;
          }
          start(async () => {
            const res = await deleteList(listId);
            if (res && "error" in res) setError(res.error);
          });
        }}
      >
        Supprimer
      </Button>

      {error && (
        <p role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
