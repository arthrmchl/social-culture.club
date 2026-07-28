"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { moveListItem, removeFromList, setListItemNote } from "@/actions/list";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { CoverPlaceholder } from "@/components/CoverPlaceholder";
import { MEDIA, formatYears } from "@/lib/media";
import type { WorkType } from "@/generated/prisma/enums";

export type ListItemRowData = {
  workId: string;
  title: string;
  type: WorkType;
  year: number | null;
  endYear: number | null;
  coverImageId: string | null;
  note: string | null;
};

/** Un élément de liste : sa place, son commentaire, ses commandes (S9). */
export function ListItemRow({
  listId,
  item,
  index,
  total,
  isRanked,
}: {
  listId: string;
  item: ListItemRowData;
  index: number;
  total: number;
  isRanked: boolean;
}) {
  const [note, setNote] = useState(item.note ?? "");
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Reflète un commentaire réécrit côté serveur (ex. après un rejeu d'import).
  const [lastNote, setLastNote] = useState(item.note);
  if (item.note !== lastNote) {
    setLastNote(item.note);
    setNote(item.note ?? "");
  }

  const cover = item.coverImageId ? `/api/uploads/${item.coverImageId}` : null;

  function run(fn: () => Promise<{ ok: true } | { error: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if ("error" in res) setError(res.error);
    });
  }

  return (
    <Card className="flex flex-col gap-2 p-3">
      <div className="flex items-center gap-3">
        {isRanked && (
          <span className="w-6 shrink-0 text-center text-sm font-semibold text-muted">
            {index + 1}
          </span>
        )}

        <div className="h-16 w-11 shrink-0 overflow-hidden rounded border border-border bg-elevated">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <CoverPlaceholder title={item.title} type={item.type} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <Link
            href={`/oeuvre/${item.workId}`}
            className="block truncate text-sm font-medium hover:text-accent"
          >
            {item.title}
          </Link>
          <p className="text-xs text-muted">
            {MEDIA[item.type].emoji} {formatYears(item)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {isRanked && (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending || index === 0}
                aria-label={`Monter ${item.title}`}
                onClick={() =>
                  run(() => moveListItem(listId, item.workId, index - 1))
                }
              >
                ↑
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending || index === total - 1}
                aria-label={`Descendre ${item.title}`}
                onClick={() =>
                  run(() => moveListItem(listId, item.workId, index + 1))
                }
              >
                ↓
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            aria-label={`Commenter ${item.title}`}
            onClick={() => setEditing((v) => !v)}
          >
            💬
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            aria-label={`Retirer ${item.title} de la liste`}
            onClick={() => run(() => removeFromList(listId, item.workId))}
          >
            ✕
          </Button>
        </div>
      </div>

      {!editing && item.note && (
        <p className="whitespace-pre-line pl-3 text-sm text-muted">
          {item.note}
        </p>
      )}

      {editing && (
        <div className="flex flex-col gap-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            placeholder="Pourquoi cette œuvre dans cette liste ?"
            aria-label={`Commentaire sur ${item.title}`}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const res = await setListItemNote(listId, item.workId, note);
                  if ("ok" in res) setEditing(false);
                  return res;
                })
              }
            >
              Enregistrer
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setNote(item.note ?? "");
                setEditing(false);
              }}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </Card>
  );
}
