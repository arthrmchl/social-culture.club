"use client";

import { useState, useTransition } from "react";
import { setTomeState } from "@/actions/progress";
import { formatTomeProgress } from "@/lib/progress";
import { cn } from "@/lib/utils";
import type { TomeState } from "@/generated/prisma/enums";

export type TomeItem = {
  id: string;
  number: number;
  state: TomeState | null;
};

// Cycle : à lire (null) → en cours → lu → à lire.
const NEXT: Record<string, TomeState | null> = {
  "": "READING",
  READING: "READ",
  READ: null,
};

const STYLE: Record<string, string> = {
  "": "border-border text-muted hover:border-accent",
  READING: "border-accent text-accent",
  READ: "border-accent bg-accent text-accent-foreground",
};

/** Suivi au tome (L4) : clic pour faire défiler à lire → en cours → lu. */
export function TomeTracker({ tomes }: { tomes: TomeItem[] }) {
  const [items, setItems] = useState(tomes);
  const [pending, start] = useTransition();

  const read = items.filter((t) => t.state === "READ").length;

  function cycle(id: string) {
    setItems((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const next = NEXT[t.state ?? ""];
        return { ...t, state: next };
      }),
    );
    const current = items.find((t) => t.id === id)?.state ?? null;
    const next = NEXT[current ?? ""];
    start(async () => {
      const res = await setTomeState(id, next);
      if ("error" in res) setItems(tomes); // revient à l'état serveur
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {formatTomeProgress(read, items.length)}
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={pending}
            onClick={() => cycle(t.id)}
            title={
              t.state === "READ"
                ? "Lu"
                : t.state === "READING"
                  ? "En cours"
                  : "À lire"
            }
            className={cn(
              "flex h-10 min-w-10 items-center justify-center rounded-md border px-2 text-sm transition-colors",
              STYLE[t.state ?? ""],
            )}
          >
            T{t.number}
          </button>
        ))}
      </div>
    </div>
  );
}
