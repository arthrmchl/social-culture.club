"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteTag, renameTag } from "@/actions/tag";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";

export type TagRow = {
  id: string;
  name: string;
  slug: string;
  works: number;
  entries: number;
};

/** Renommer et supprimer ses étiquettes (S10). */
export function TagManager({ tags }: { tags: TagRow[] }) {
  return (
    <Card className="flex flex-col divide-y divide-border p-0">
      {tags.map((tag) => (
        <TagRowItem key={tag.id} tag={tag} />
      ))}
    </Card>
  );
}

function TagRowItem({ tag }: { tag: TagRow }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const uses =
    [
      tag.works > 0 ? `${tag.works} œuvre${tag.works > 1 ? "s" : ""}` : null,
      tag.entries > 0
        ? `${tag.entries} entrée${tag.entries > 1 ? "s" : ""}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Aucun usage";

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      {editing ? (
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          className="max-w-56"
          aria-label={`Renommer ${tag.name}`}
        />
      ) : (
        <Link
          href={`/tag/${tag.slug}`}
          className="text-sm font-medium hover:text-accent"
        >
          #{tag.name}
        </Link>
      )}

      <span className="text-xs text-muted">{uses}</span>

      <div className="ml-auto flex gap-1">
        {editing ? (
          <>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                setError(null);
                start(async () => {
                  const res = await renameTag(tag.id, name);
                  if ("error" in res) setError(res.error);
                  else setEditing(false);
                });
              }}
            >
              Enregistrer
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setName(tag.name);
                setEditing(false);
                setError(null);
              }}
            >
              Annuler
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
              aria-label={`Renommer ${tag.name}`}
            >
              Renommer
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              aria-label={`Supprimer ${tag.name}`}
              onClick={() => {
                if (
                  !confirm(
                    `Supprimer l'étiquette « ${tag.name} » ? Les œuvres et les entrées sont conservées.`,
                  )
                ) {
                  return;
                }
                setError(null);
                start(async () => {
                  const res = await deleteTag(tag.id);
                  if ("error" in res) setError(res.error);
                });
              }}
            >
              Supprimer
            </Button>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="w-full text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
