"use client";

import { useState, useTransition } from "react";
import { setGoal } from "@/actions/goal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { goalProgress, scopeEmoji, scopeLabel } from "@/lib/goals";
import type { GoalScope } from "@/generated/prisma/enums";

/** Une ligne d'objectif : la cible, la jauge, le réglage (L5, D12). */
export function GoalRow({
  year,
  scope,
  target,
  done,
}: {
  year: number;
  scope: GoalScope;
  target: number;
  done: number;
}) {
  const [value, setValue] = useState(target > 0 ? String(target) : "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [last, setLast] = useState(target);
  if (target !== last) {
    setLast(target);
    setValue(target > 0 ? String(target) : "");
  }

  const parsedTarget = Number(value) || 0;
  const progress = goalProgress(done, parsedTarget);
  const dirty = parsedTarget !== target;

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-32 text-sm font-medium">
          {scopeEmoji(scope)} {scopeLabel(scope)}
        </span>

        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            value={value}
            disabled={pending}
            onChange={(e) => setValue(e.target.value)}
            className="w-24"
            aria-label={`Objectif ${scopeLabel(scope)} pour ${year}`}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={pending || !dirty}
            onClick={() => {
              setError(null);
              start(async () => {
                const res = await setGoal({
                  year,
                  scope,
                  target: parsedTarget,
                });
                if ("error" in res) setError(res.error);
              });
            }}
          >
            {parsedTarget === 0 && target > 0 ? "Retirer" : "Enregistrer"}
          </Button>
        </div>

        <span className="ml-auto text-sm text-muted">
          {target > 0
            ? progress.reached
              ? `${done} / ${target} — objectif atteint 🎉`
              : `${done} / ${target} — ${progress.remaining} restant${progress.remaining > 1 ? "s" : ""}`
            : `${done} cette année`}
        </span>
      </div>

      {target > 0 && (
        <div
          className="h-2 overflow-hidden rounded-full bg-elevated"
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progression ${scopeLabel(scope)}`}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width]"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
