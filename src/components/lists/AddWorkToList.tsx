"use client";

import { useState, useTransition } from "react";
import { addToList } from "@/actions/list";
import { searchForPicker, type PickerResult } from "@/actions/search";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { MEDIA, formatYears } from "@/lib/media";

/**
 * Ajout d'une œuvre à une liste, par recherche floue dans le catalogue
 * partagé (S1). Aucune création ici : on range ce qui existe.
 */
export function AddWorkToList({ listId }: { listId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerResult[]>([]);
  const [searching, startSearch] = useTransition();
  const [adding, startAdd] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);

  function search(next: string) {
    setQuery(next);
    setError(null);
    if (next.trim().length < 2) {
      setResults([]);
      return;
    }
    startSearch(async () => setResults(await searchForPicker(next)));
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <Input
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder="Chercher une œuvre à ajouter…"
        aria-label="Chercher une œuvre à ajouter"
      />

      {searching && <p className="text-xs text-muted">Recherche…</p>}

      {!searching && query.trim().length >= 2 && results.length === 0 && (
        <p className="text-sm text-muted">
          Aucune œuvre trouvée. Les listes ne rangent que des fiches
          existantes&nbsp;: créez-la d&apos;abord depuis « Créer ».
        </p>
      )}

      {results.length > 0 && (
        <ul className="flex flex-col divide-y divide-border">
          {results.map((r) => (
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
                disabled={adding || added.includes(r.id)}
                onClick={() =>
                  startAdd(async () => {
                    const res = await addToList(listId, r.id);
                    if ("error" in res) setError(res.error);
                    else setAdded((prev) => [...prev, r.id]);
                  })
                }
              >
                {added.includes(r.id) ? "Ajoutée" : "Ajouter"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </Card>
  );
}
