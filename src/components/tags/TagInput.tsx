"use client";

import { useState, useTransition } from "react";
import { setEntryTags, setWorkTags, suggestTags } from "@/actions/tag";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { formatTagInput, parseTagInput } from "@/lib/tags";

export type TagTarget =
  { kind: "work"; id: string } | { kind: "entry"; id: string };

/**
 * Saisie libre d'étiquettes (S10), séparées par des virgules.
 *
 * L'aperçu affiché est celui de `parseTagInput` : ce que l'on voit est
 * exactement ce qui sera enregistré, doublons fondus compris.
 */
export function TagInput({
  target,
  tags,
}: {
  target: TagTarget;
  tags: { name: string; slug: string }[];
}) {
  const [value, setValue] = useState(formatTagInput(tags));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [hints, setHints] = useState<{ name: string; slug: string }[]>([]);

  // Reflète des étiquettes réécrites côté serveur (ex. rejeu d'un import).
  const [lastTags, setLastTags] = useState(tags);
  if (tags !== lastTags) {
    setLastTags(tags);
    setValue(formatTagInput(tags));
  }

  const preview = parseTagInput(value);
  const dirty = formatTagInput(preview) !== formatTagInput(lastTags);

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      const res =
        target.kind === "work"
          ? await setWorkTags(target.id, value)
          : await setEntryTags(target.id, value);
      if ("error" in res) setError(res.error);
      else setSaved(true);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          value={value}
          disabled={pending}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
            const last = e.target.value.split(",").pop()?.trim() ?? "";
            if (last.length >= 1) {
              start(async () => setHints(await suggestTags(last)));
            } else {
              setHints([]);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          placeholder="policier, années 70, à relire"
          aria-label="Étiquettes, séparées par des virgules"
        />
        {/* Le libellé nomme sa cible : plusieurs formulaires cohabitent sur la
            fiche, et « Enregistrer » seul ne dit pas quoi. */}
        <Button size="sm" disabled={pending || !dirty} onClick={save}>
          {saved && !dirty
            ? "Étiquettes enregistrées"
            : "Enregistrer les étiquettes"}
        </Button>
      </div>

      {hints.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hints.map((h) => (
            <button
              key={h.slug}
              type="button"
              className="rounded-full border border-border px-2 py-0.5 text-xs text-muted hover:bg-elevated"
              onClick={() => {
                const parts = value.split(",");
                parts[parts.length - 1] = ` ${h.name}`;
                setValue(parts.join(",").replace(/^\s+/, ""));
                setHints([]);
              }}
            >
              + {h.name}
            </button>
          ))}
        </div>
      )}

      {preview.length > 0 && (
        <p className="text-xs text-muted">
          {preview.length} étiquette{preview.length > 1 ? "s" : ""} :{" "}
          {preview.map((t) => t.name).join(" · ")}
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
