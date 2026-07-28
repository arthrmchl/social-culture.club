"use client";

import { useState, useTransition } from "react";
import { resolveCorrection } from "@/actions/correction";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatDate } from "@/lib/dates";

export type CorrectionData = {
  id: string;
  field: string | null;
  message: string;
  createdAt: Date;
  author: { name: string; username: string | null };
};

/**
 * Les propositions en attente sur une fiche (D30), pour son créateur et
 * l'administrateur.
 *
 * « Appliquée » ne modifie pas la fiche : c'est un classement. L'édition passe
 * par le formulaire d'œuvre, qui reste le seul endroit où l'on écrit dans le
 * catalogue.
 */
export function CorrectionQueue({
  corrections,
}: {
  corrections: CorrectionData[];
}) {
  const [rows, setRows] = useState(corrections);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [last, setLast] = useState(corrections);
  if (corrections !== last) {
    setLast(corrections);
    setRows(corrections);
  }

  if (rows.length === 0) return null;

  function resolve(id: string, decision: "APPLIED" | "REJECTED") {
    setError(null);
    const previous = rows;
    setRows((r) => r.filter((c) => c.id !== id));
    start(async () => {
      const res = await resolveCorrection(id, decision);
      if ("error" in res) {
        setRows(previous);
        setError(res.error);
      }
    });
  }

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
        {rows.length} proposition{rows.length > 1 ? "s" : ""} de correction
      </h2>
      <ul className="flex flex-col gap-2">
        {rows.map((c) => (
          <li key={c.id}>
            <Card className="p-3">
              <p className="text-xs text-muted">
                {c.author.name}
                {c.author.username && ` · @${c.author.username}`} ·{" "}
                {formatDate(c.createdAt)}
                {c.field && ` · ${c.field}`}
              </p>
              <p className="mt-1 text-sm">{c.message}</p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => resolve(c.id, "APPLIED")}
                >
                  Marquer comme appliquée
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => resolve(c.id, "REJECTED")}
                >
                  Écarter
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
