"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addToList, myListsFor, removeFromList } from "@/actions/list";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type Entry = { id: string; title: string; contains: boolean };

/**
 * « Ajouter à une liste » depuis une fiche d'œuvre (S9).
 *
 * Les listes ne sont chargées qu'à l'ouverture du panneau : la fiche n'a pas à
 * payer une requête de plus pour un bouton qu'on n'ouvre pas toujours.
 */
export function AddToListButton({ workId }: { workId: string }) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<Entry[] | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && lists === null) {
      start(async () => setLists(await myListsFor(workId)));
    }
  }

  function toggleMembership(entry: Entry) {
    setError(null);
    // Bascule optimiste : l'aller-retour serveur ne doit pas faire clignoter
    // la case à cocher.
    setLists(
      (prev) =>
        prev?.map((l) =>
          l.id === entry.id ? { ...l, contains: !l.contains } : l,
        ) ?? null,
    );
    start(async () => {
      const res = entry.contains
        ? await removeFromList(entry.id, workId)
        : await addToList(entry.id, workId);
      if ("error" in res) {
        setError(res.error);
        setLists(
          (prev) =>
            prev?.map((l) =>
              l.id === entry.id ? { ...l, contains: entry.contains } : l,
            ) ?? null,
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          variant="secondary"
          size="sm"
          onClick={toggleOpen}
          aria-expanded={open}
        >
          📋 Ajouter à une liste
        </Button>
      </div>

      {open && (
        <Card className="flex flex-col gap-2 p-3">
          {lists === null && <p className="text-sm text-muted">Chargement…</p>}

          {lists?.length === 0 && (
            <p className="text-sm text-muted">
              Aucune liste pour l&apos;instant.{" "}
              <Link href="/listes" className="text-accent hover:underline">
                En créer une
              </Link>
              .
            </p>
          )}

          {lists?.map((l) => (
            <label key={l.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={l.contains}
                disabled={pending}
                onChange={() => toggleMembership(l)}
                className="size-4 accent-[var(--accent)]"
              />
              {l.title}
            </label>
          ))}

          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
