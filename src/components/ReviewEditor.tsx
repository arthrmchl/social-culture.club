"use client";

import { useState, useTransition } from "react";
import { setWorkReview } from "@/actions/status";
import { setSeasonReview } from "@/actions/season";
import { Textarea } from "./ui/Field";
import { Button } from "./ui/Button";
import type { RatingTarget } from "./RatingStars";

async function save(
  target: RatingTarget,
  text: string,
  spoiler: boolean,
) {
  return target.kind === "work"
    ? setWorkReview(target.id, { text, spoiler })
    : setSeasonReview(target.id, { text, spoiler });
}

/** Critique rattachée à l'œuvre ou à la saison (S7), markdown + spoiler. */
export function ReviewEditor({
  target,
  text,
  hasSpoiler,
  label = "Ma critique",
}: {
  target: RatingTarget;
  text: string | null;
  hasSpoiler: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(text ?? "");
  const [spoiler, setSpoiler] = useState(hasSpoiler);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-accent hover:underline"
      >
        {text ? "Modifier ma critique" : "Écrire une critique"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">{label}</label>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Markdown accepté : **gras**, *italique*, listes, > citation…"
        rows={5}
      />
      <label className="flex items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          checked={spoiler}
          onChange={(e) => setSpoiler(e.target.checked)}
        />
        Contient un spoiler
      </label>
      {error && <p className="text-xs text-danger">{error}</p>}
      {saved && <p className="text-xs text-muted">Enregistré.</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            setSaved(false);
            start(async () => {
              const res = await save(target, value, spoiler);
              if ("error" in res) setError(res.error);
              else {
                setSaved(true);
                setOpen(false);
              }
            });
          }}
        >
          Enregistrer
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            setValue(text ?? "");
            setSpoiler(hasSpoiler);
            setOpen(false);
          }}
        >
          Annuler
        </Button>
      </div>
    </div>
  );
}
